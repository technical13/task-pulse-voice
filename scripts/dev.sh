#!/usr/bin/env bash
set -e

npm run dev:server &
SERVER_PID=$!

npm run dev:client &
CLIENT_PID=$!

trap "kill $SERVER_PID $CLIENT_PID" EXIT

wait
