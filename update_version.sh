#!/bin/bash

version=$(cat VERSION)
npm --no-git-tag-version version $version
node -e "const data=require('./manifest.json'); data.version='${version}'; require('fs').writeFileSync('./manifest.json', JSON.stringify(data, null, 2))"
