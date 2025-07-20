#!/bin/bash

steamcmd \
	+@sSteamCmdForcePlatformType windows \
	+force_install_dir /app \
	+login anonymous \
	+app_update 2857200 validate \
	+quit
