@echo off

REM Small script I use to upload bot to a raspberry pi
scp -r bob.js fun.js elo_fix.js categories.js roles.js config.json emotes.json package.json package-lock.json run.sh ubuntu@192.168.1.163:~/bingo-bot/
ssh ubuntu@192.168.1.163 "cd bingo-bot/ && chmod +x run.sh && ./run.sh"
