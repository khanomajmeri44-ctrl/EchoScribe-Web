@echo off
set WRANGLER_LOG_PATH=.wrangler\wrangler.log
npm.cmd exec vinext dev > dev.log 2>&1
