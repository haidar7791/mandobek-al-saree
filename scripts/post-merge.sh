#!/bin/bash
set -e

# Post-merge setup: install any new dependencies added by merged tasks
npm install --legacy-peer-deps
