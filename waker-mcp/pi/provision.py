#!/usr/bin/env python3
"""Create the Pi's root-only poller configuration without printing its token."""

import ipaddress
import os
import re
import secrets
import sys
from urllib.parse import urlparse


def main() -> None:
    if os.geteuid() != 0 or len(sys.argv) != 4:
        raise SystemExit("Run as root with URL, iMac MAC, and broadcast IP")
    url, mac, broadcast = sys.argv[1:]
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname is None or not parsed.hostname.endswith(".workers.dev") or parsed.path not in ("", "/"):
        raise SystemExit("Expected an HTTPS workers.dev origin")
    if re.fullmatch(r"(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}", mac) is None:
        raise SystemExit("Invalid iMac MAC")
    ipaddress.IPv4Address(broadcast)

    content = (
        f"SPEAKUP_WAKER_URL={url.rstrip('/')}\n"
        f"SPEAKUP_PI_TOKEN={secrets.token_hex(32)}\n"
        f"SPEAKUP_IMAC_MAC={mac}\n"
        f"SPEAKUP_BROADCAST={broadcast}\n"
    )
    path = "/etc/speakup-waker.env"
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as target:
            target.write(content)
    except BaseException:
        os.unlink(path)
        raise
    print("Created root-only SpeakUp Waker configuration")


if __name__ == "__main__":
    main()
