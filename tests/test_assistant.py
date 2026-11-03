import io
import json
import os
import unittest
import urllib.error
from unittest.mock import patch, MagicMock
from server.app import create_app
from server.assistant import CompatibleAssistant, AssistantError, validate_context

PAYLOAD = {"question":"整理复核要点", "context":{"source":"预设演示，非模型推理","model":"demo","threshold":.5,"crop":"番茄","notes":"","detections":[{"label":"叶斑","confidence":.9,"box":[.1,.2,.5,.6],"review":"待确认","note":""}]}}
ENV = {"FIELDLENS_AI_BASE_URL":"https://example.invalid/v1", "FIELDLENS_AI_MODEL":"test-model", "FIELDLENS_AI_API_KEY":"test-secret"}

class FakeAssistant:
    status = {"configured":True,"provider":"test.invalid","model":"test-model"}
    def generate(self, context, question):
        self.received=(context,question)
        return dict(text="模拟参考，需核查",model="test-model",provider="test.invalid")

class AssistantTest(unittest.TestCase):
    def test_unconfigured_does_not_fake_success(self):
        with patch.dict(os.environ, {}, clear=True):
            client=create_app().test_client()
            self.assertFalse(client.get('/api/assistant/status').json['configured'])
            self.assertEqual(client.post('/api/assistant',json=PAYLOAD).status_code,503)

    def test_api_contract_whitelists_context_without_client_settings(self):
        fake=FakeAssistant(); client=create_app(assistant=fake).test_client()
        payload={**PAYLOAD,"url":"https://attacker.invalid","key":"client-secret","context":{**PAYLOAD['context'],"plot":"private"}}
        result=client.post('/api/assistant',json=payload)
        self.assertEqual(result.status_code,200)
        self.assertNotIn('plot',fake.received[0])
        self.assertNotIn('key',fake.received[0])
        self.assertEqual(result.headers['Cache-Control'],'no-store')

    def test_invalid_input_is_rejected_before_provider(self):
        client=create_app(assistant=FakeAssistant()).test_client()
        for data in [None,[],{}, {**PAYLOAD,'question':''}, {**PAYLOAD,'question':'x'*501}, {**PAYLOAD,'context':{**PAYLOAD['context'],'threshold':True}}, {**PAYLOAD,'context':{**PAYLOAD['context'],'detections':[None]}}]:
            response=client.post('/api/assistant',data=json.dumps(data),content_type='application/json')
            self.assertEqual(response.status_code,400)
        self.assertEqual(client.post('/api/assistant',data='x').status_code,415)
        self.assertEqual(client.post('/api/assistant',data='x'*131073,content_type='application/json').status_code,413)

    def test_cross_origin_webpage_cannot_trigger_provider(self):
        client=create_app(assistant=FakeAssistant()).test_client()
        self.assertEqual(client.post('/api/assistant',json=PAYLOAD,headers={'Origin':'https://attacker.invalid'}).status_code,403)
        self.assertEqual(client.post('/api/assistant',json=PAYLOAD,headers={'Origin':'http://localhost:5173'}).status_code,200)

    def test_generic_failure_never_exposes_secrets(self):
        fake=FakeAssistant()
        fake.generate=MagicMock(side_effect=RuntimeError('test-secret'))
        result=create_app(assistant=fake).test_client().post('/api/assistant',json=PAYLOAD)
        self.assertEqual(result.status_code,502)
        self.assertNotIn('test-secret',result.get_data(as_text=True))

    def test_compatible_transport_and_no_key_in_status(self):
        with patch.dict(os.environ,ENV,clear=True): advisor=CompatibleAssistant()
        self.assertNotIn('test-secret',json.dumps(advisor.status))
        response=MagicMock()
        response.__enter__.return_value.read.return_value=json.dumps({'choices':[{'message':{'content':'参考内容'}}]}).encode()
        opener=MagicMock(); opener.open.return_value=response
        with patch('urllib.request.build_opener',return_value=opener):
            result=advisor.generate(*validate_context(PAYLOAD))
        req=opener.open.call_args.args[0]
        self.assertEqual(req.full_url,'https://example.invalid/v1/chat/completions')
        self.assertEqual(req.headers['Authorization'],'Bearer test-secret')
        self.assertEqual(json.loads(req.data)['model'],'test-model')
        self.assertEqual(result['text'],'参考内容')

    def test_provider_failures_and_malformed_output(self):
        with patch.dict(os.environ,ENV,clear=True): advisor=CompatibleAssistant()
        for code in [401,429,500,302]:
            opener=MagicMock(); opener.open.side_effect=urllib.error.HTTPError('url',code,'test-secret',{},None)
            with patch('urllib.request.build_opener',return_value=opener), self.assertRaises(AssistantError) as caught:
                advisor.generate(*validate_context(PAYLOAD))
            self.assertNotIn('test-secret',str(caught.exception))
        for body in [b'not-json',b'{}',b'{"choices":[]}',b'x'*131073]:
            response=MagicMock();response.__enter__.return_value.read.return_value=body
            opener=MagicMock();opener.open.return_value=response
            with patch('urllib.request.build_opener',return_value=opener), self.assertRaises(AssistantError): advisor.generate(*validate_context(PAYLOAD))

    def test_http_only_allowed_for_loopback_and_url_credentials_rejected(self):
        for url in ['http://remote.invalid/v1','https://user:secret@example.invalid/v1','https://example.invalid/v1?token=secret','file:///tmp/key']:
            with patch.dict(os.environ,{**ENV,'FIELDLENS_AI_BASE_URL':url},clear=True): self.assertFalse(CompatibleAssistant().status['configured'])
        with patch.dict(os.environ,{**ENV,'FIELDLENS_AI_BASE_URL':'http://127.0.0.1:11434/v1','FIELDLENS_AI_API_KEY':''},clear=True): self.assertTrue(CompatibleAssistant().status['configured'])

if __name__=='__main__': unittest.main()
