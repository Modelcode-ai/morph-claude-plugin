import argparse
import sys


def parse_args(argv):
    p = argparse.ArgumentParser(prog="itemsctl")
    p.add_argument("cmd", choices=["list", "get"])
    p.add_argument("id", nargs="?")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    print("apple\npear" if args.cmd == "list" else "apple")
    return 0
