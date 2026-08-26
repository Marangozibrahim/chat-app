"""Locust load test for the chat app's WebSocket layer.

No off-the-shelf Locust User class does raw WebSockets (locust-plugins'
WebSocketUser was checked and doesn't exist in current versions; Locust
core only ships Socket.IO support, a different protocol). This follows
Locust's own documented pattern for non-HTTP protocols: a custom User
that wraps a client library and fires events.request itself so Locust's
built-in stats/charts/web UI work exactly as they do for HTTP.

Reads the same fixture backend/scripts/db_seed.py produces (mounted
read-only into this container at /fixtures/.loadtest_users.json) — seed
with that script before pointing Locust at the app; this file never
registers users itself.

Run via docker-compose.loadtest.yml (locust-master / locust-worker
services), not directly — see README's Load Testing section.
"""
import json
import random
import time
from pathlib import Path

import gevent
import websocket
from locust import User, between, events, task

FIXTURE_PATH = Path("/fixtures/.loadtest_users.json")


def load_fixture():
    if not FIXTURE_PATH.exists():
        raise RuntimeError(
            f"{FIXTURE_PATH} not found — run db_seed.py first: "
            "docker compose exec backend python scripts/db_seed.py --users N --rooms M"
        )
    return json.loads(FIXTURE_PATH.read_text())


FIXTURE = load_fixture()


class ChatUser(User):
    # Message/ping pacing per simulated user; independent of Locust's
    # spawn rate, which controls how fast new users ramp up.
    wait_time = between(20, 40)

    def on_start(self):
        self.chat_user = random.choice(FIXTURE["users"])
        self.room_id = random.choice(FIXTURE["rooms"])
        ws_host = self.host.replace("http://", "ws://").replace("https://", "wss://")
        url = f"{ws_host}/ws/rooms/{self.room_id}?token={self.chat_user['access_token']}"

        self.ws = None
        self._closing = False
        start = time.perf_counter()
        try:
            self.ws = websocket.create_connection(url, timeout=10)
            # create_connection's timeout applies to the handshake AND to every
            # later recv/send on the socket. Left at 10s, the receive loop below
            # raises WebSocketTimeoutException after 10 quiet seconds and stops
            # reading, which means the server's WebSocket pings never get a pong
            # and the connection is dropped mid-run. Clear it after the
            # handshake: gevent keeps the blocking recv cooperative anyway.
            self.ws.settimeout(None)
        except Exception as e:
            self._fire("connect", start, exception=e)
            return
        self._fire("connect", start)
        # Drain incoming broadcasts so the socket's receive buffer never
        # backs up — a real client always has something reading it.
        self._receiver = gevent.spawn(self._receive_loop)

    def on_stop(self):
        # Tells the receive loop that the close it is about to see is ours, not
        # a failure: without this every user reports a bogus "recv" failure at
        # the end of a run, which pollutes the failure ratio and makes Locust
        # exit non-zero on a perfectly clean run.
        self._closing = True
        if getattr(self, "_receiver", None):
            self._receiver.kill(block=False)
        if self.ws:
            self.ws.close()

    def _receive_loop(self):
        # Must survive quiet periods: a dead reader stops answering server pings,
        # which closes the connection. Only a real socket error ends the loop --
        # and when that happens it is reported as a "recv" failure rather than
        # swallowed, because a silently dead reader looks identical to a healthy
        # idle one until the connection dies 20s later with a broken pipe.
        start = time.perf_counter()
        while True:
            try:
                self.ws.recv()
            except websocket.WebSocketTimeoutException:
                continue
            except Exception as e:
                if not getattr(self, "_closing", False):
                    self._fire("recv", start, exception=e)
                return

    def _fire(self, name, start, exception=None, response_length=0):
        events.request.fire(
            request_type="WS",
            name=name,
            response_time=(time.perf_counter() - start) * 1000,
            response_length=response_length,
            exception=exception,
        )

    def _send(self, name, payload):
        if not self.ws:
            return
        body = json.dumps(payload)
        start = time.perf_counter()
        try:
            self.ws.send(body)
        except Exception as e:
            self._fire(name, start, exception=e)
            return
        self._fire(name, start, response_length=len(body))

    @task(3)
    def ping(self):
        self._send("ping", {"type": "ping"})

    @task(1)
    def message(self):
        self._send("message", {"type": "message", "body": f"hello from {self.chat_user['username']}"})
