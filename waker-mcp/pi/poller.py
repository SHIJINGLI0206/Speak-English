#!/usr/bin/env python3
"""Outbound-only, fixed-command Wake-on-LAN poller for the SpeakUp iMac."""

import json
import logging
import os
import subprocess
import time
import urllib.error
import urllib.request

API_BASE = os.environ["SPEAKUP_WAKER_URL"].rstrip("/")
TOKEN = os.environ["SPEAKUP_PI_TOKEN"]
MAC = os.environ["SPEAKUP_IMAC_MAC"]
BROADCAST = os.environ["SPEAKUP_BROADCAST"]
INTERVAL = 10


def post(path: str, body: dict | None = None) -> dict | None:
    payload = b"{}" if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        API_BASE + path,
        data=payload,
        headers={
            "Authorization": "Bearer " + TOKEN,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "SpeakUp-Waker/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        if response.status == 204:
            return None
        if response.status != 200:
            raise RuntimeError("Unexpected API response: " + str(response.status))
        raw = response.read(4096)
        return json.loads(raw)


def main() -> None:
    if not API_BASE.startswith("https://") or not API_BASE.endswith(".workers.dev"):
        raise ValueError("Waker URL must be the expected HTTPS Workers endpoint")
    if len(TOKEN) < 40:
        raise ValueError("Pi token is missing or too short")

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    while True:
        try:
            job = post("/pi/jobs/claim")
            if job:
                job_id = job.get("id")
                if not isinstance(job_id, str) or len(job_id) > 64:
                    raise ValueError("Invalid job ID")
                result = subprocess.run(
                    ["/usr/bin/wakeonlan", "-i", BROADCAST, "-p", "9", MAC],
                    capture_output=True,
                    text=True,
                    timeout=8,
                    check=False,
                )
                status = "packet_sent" if result.returncode == 0 else "failed"
                post("/pi/jobs/" + job_id + "/result", {"status": status})
                logging.info("Wake job %s: %s", job_id, status)
        except urllib.error.HTTPError as error:
            logging.warning("Poll HTTP %s", error.code)
        except (urllib.error.URLError, TimeoutError, RuntimeError, ValueError, OSError) as error:
            logging.warning("Poll cycle failed: %s", type(error).__name__)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
