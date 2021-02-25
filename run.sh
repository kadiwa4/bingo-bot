#!/bin/sh
ps aux | grep node | awk '{print $2}' | while read line ; do kill $line ; done
npm start
