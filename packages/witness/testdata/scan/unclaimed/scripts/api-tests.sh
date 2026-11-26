#!/bin/sh
# Runs the HTTP scenarios against a running API.
set -e
hurl --test --variable host=http://localhost:3000 api/*.hurl
