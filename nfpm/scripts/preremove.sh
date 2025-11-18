#!/bin/bash
set -e

before_remove () {
    debsystemctl=$(command -v deb-systemd-invoke || echo systemctl)
    $debsystemctl stop ldap-gateway.service >/dev/null || true
    $debsystemctl disable ldap-gateway.service >/dev/null || true
    $debsystemctl --system daemon-reload >/dev/null || true
}

if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
    before_remove
fi