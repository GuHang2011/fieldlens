import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from server.app import create_app
from server.auth import COOKIE

HEADERS={"X-FieldLens-Request":"1","Origin":"http://localhost"}


class AuthTest(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{"FIELDLENS_AUTH_ENABLED":"true","FIELDLENS_AUTH_DB":str(Path(self.directory.name)/"accounts.sqlite3"),"FIELDLENS_COOKIE_SECURE":"false"})
        self.env.start()
        self.app=create_app(); self.client=self.app.test_client(); self.accounts=self.app.extensions["accounts"]
        self.accounts.set_user("inspector","a-test-password-2026","巡检员")

    def tearDown(self):
        self.env.stop(); self.directory.cleanup()

    def login(self,**kwargs):
        return self.client.post('/api/auth/login',json={"username":"inspector","password":"a-test-password-2026",**kwargs},headers=HEADERS)

    def test_login_protects_all_service_endpoints_and_logout_revokes(self):
        for route in ['/api/health','/api/assistant/status']:
            self.assertEqual(self.client.get(route).status_code,401)
        for route in ['/api/detect','/api/assistant']:
            self.assertEqual(self.client.post(route,headers=HEADERS).status_code,401)
        self.assertIsNone(self.client.get('/api/auth/session').json['user'])
        result=self.login(); self.assertEqual(result.status_code,200)
        self.assertEqual(result.json['user']['name'],'巡检员')
        self.assertNotIn('password',str(result.json))
        self.assertIn('HttpOnly',result.headers['Set-Cookie']); self.assertIn('SameSite=Lax',result.headers['Set-Cookie'])
        self.assertEqual(self.client.get('/api/health').status_code,200)
        token=self.client.get_cookie(COOKIE,path='/api').value
        with self.accounts.connect() as db:
            stored=db.execute('SELECT digest FROM sessions').fetchone()[0]
            self.assertNotEqual(stored,token)
            self.assertNotEqual(db.execute('SELECT password_hash FROM users').fetchone()[0],'a-test-password-2026')
        self.client.post('/api/auth/logout',headers=HEADERS)
        self.assertIsNone(self.accounts.user(token))
        self.assertEqual(self.client.get('/api/health').status_code,401)

    def test_cross_origin_and_missing_custom_header_rejected(self):
        payload={"username":"inspector","password":"a-test-password-2026"}
        for headers in [{}, {"X-FieldLens-Request":"1","Origin":"https://attacker.invalid"}, {"X-FieldLens-Request":"1","Sec-Fetch-Site":"cross-site"}]:
            self.assertEqual(self.client.post('/api/auth/login',json=payload,headers=headers).status_code,403)
        self.login()
        self.assertEqual(self.client.post('/api/assistant',json={},headers={"Origin":"http://localhost"}).status_code,403)

    def test_wrong_password_rate_limit_and_expiry(self):
        for _ in range(8): self.assertEqual(self.login(password='wrong-password').status_code,401)
        self.assertEqual(self.login().status_code,429)
        with self.accounts.connect() as db: db.execute('UPDATE attempts SET stamp=?',(time.time()-901,))
        self.assertEqual(self.login().status_code,200)
        with self.accounts.connect() as db: db.execute('UPDATE sessions SET expires=?',(time.time()-1,))
        self.assertEqual(self.client.get('/api/health').status_code,401)

    def test_password_reset_and_disable_revoke_sessions(self):
        self.login()
        self.accounts.set_user('inspector','new-test-password-2026',reset=True)
        self.assertEqual(self.client.get('/api/health').status_code,401)
        self.assertEqual(self.login(password='new-test-password-2026').status_code,200)
        self.accounts.disable('inspector')
        self.assertEqual(self.client.get('/api/health').status_code,401)
        self.assertEqual(self.login(password='new-test-password-2026').status_code,401)

    def test_validation_and_cookie_rotation(self):
        with self.assertRaises(ValueError): self.accounts.set_user('short','123')
        self.assertEqual(self.client.post('/api/auth/login',json=[],headers=HEADERS).status_code,400)
        self.assertEqual(self.client.post('/api/auth/login',json={"username":"x","password":"x"*129},headers=HEADERS).status_code,400)
        self.login(); old=self.client.get_cookie(COOKIE,path='/api').value
        self.login(); new=self.client.get_cookie(COOKIE,path='/api').value
        self.assertNotEqual(old,new); self.assertIsNone(self.accounts.user(old))

    def test_https_cookie_flag_and_no_store(self):
        with patch.dict(os.environ,{"FIELDLENS_COOKIE_SECURE":"true"}):
            client=create_app().test_client()
        result=client.post('/api/auth/login',json={"username":"inspector","password":"a-test-password-2026"},headers={"X-FieldLens-Request":"1","Origin":"https://localhost"},base_url='https://localhost')
        self.assertEqual(result.status_code,200)
        self.assertIn('Secure',result.headers['Set-Cookie'])
        self.assertEqual(result.headers['Cache-Control'],'no-store')

    def test_successful_logins_do_not_consume_failed_attempt_budget(self):
        for _ in range(9):
            self.assertEqual(self.login().status_code,200)
        for _ in range(8):
            self.assertEqual(self.login(password='wrong-password').status_code,401)
        self.assertEqual(self.login().status_code,429)


if __name__=='__main__': unittest.main()
