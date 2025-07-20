#!/bin/bash

export APP_NAME="abiotic-factor"

set -e
cd "$(dirname "$0")"

mkdir -p data/saves data/mods data/logs

./stop.sh

docker build -t $APP_NAME -f docker/Dockerfile .

if [ "${APP_SERVICE:-}" = "true" ]; then
    DETACHED="-d"
else
    DETACHED=""
fi

docker run --rm -it $DETACHED \
    --name $APP_NAME \
    --log-driver local \
    --log-opt max-size=200k \
    --log-opt max-file=3 \
    -v "$(pwd)/data/saves:/app/AbioticFactor/Saved/SaveGames/Server" \
    -v "$(pwd)/data/logs:/data/logs" \
    -p 8080:8080/tcp \
    -p 7777:7777/udp \
    -p 27015:27015/udp \
    $APP_NAME \
    $@
