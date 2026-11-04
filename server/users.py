"""Run `python -m server.users create USERNAME --name NAME` on the server."""
import argparse
import getpass
from .auth import Accounts, database_path


def main():
    parser = argparse.ArgumentParser(description="禾镜账号管理（管理员在服务器执行）")
    parser.add_argument("action", choices=["create", "password", "disable", "list"])
    parser.add_argument("username", nargs="?")
    parser.add_argument("--name")
    args = parser.parse_args()
    accounts = Accounts(database_path())
    try:
        if args.action == "list":
            with accounts.connect() as db:
                for row in db.execute("SELECT username,name,active FROM users ORDER BY username"):
                    print(f"{row['username']}\t{row['name']}\t{'启用' if row['active'] else '停用'}")
            return
        if not args.username:
            parser.error("此操作需要账号名")
        if args.action == "disable":
            accounts.disable(args.username)
        else:
            password = getpass.getpass("密码（至少 12 位，不回显）：")
            if password != getpass.getpass("再次输入密码："):
                raise ValueError("两次密码不一致")
            accounts.set_user(args.username, password, args.name, reset=args.action == "password")
        print("账号操作已完成。密码重置和停用会撤销既有登录会话。")
    except ValueError as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
