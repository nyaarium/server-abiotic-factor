#!/bin/bash

export APP_NAME="abiotic-factor"

set -e
cd "$(dirname "$0")"

git fetch --prune
git pull || true

export APP_SERVICE=true
./run.sh

docker logs -f --tail 0 $APP_NAME
