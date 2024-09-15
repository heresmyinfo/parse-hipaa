#!/bin/bash

# Change directory to the parse folder
cd /Users/peterlindsay/apps/parse-hipaa/parse

# Run docker compose down
docker compose down

# Build the Docker image
docker build -t heresmyinfo/parse-hipaa:2.0 .

# Change directory back to the main project folder
cd /Users/peterlindsay/apps/parse-hipaa

# Run docker compose up
docker compose up