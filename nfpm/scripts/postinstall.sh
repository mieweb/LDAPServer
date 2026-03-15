#!/bin/bash

after_upgrade () {
    debsystemctl=$(command -v deb-systemd-invoke || echo systemctl)
    $debsystemctl --system daemon-reload >/dev/null || true

    if $debsystemctl is-enabled ldap-gateway.service >/dev/null 2>&1; then
        $debsystemctl restart ldap-gateway.service >/dev/null || true
    fi
}

after_install () {
    if ! getent passwd ldap-gateway >/dev/null 2>&1; then
        useradd --quiet --system --group --disabled-login --no-create-home --home-dir /nonexistent ldap-gateway
    fi
    chown -R ldap-gateway:ldap-gateway /opt/ldap-gateway
    
    debsystemctl=$(command -v deb-systemd-invoke || echo systemctl)
    $debsystemctl daemon-reload >/dev/null || true
}

if [ "$1" = "configure" -a -z "$2" ] || \
    [ "$1" = "abort-remove" ]; \
then
    after_install
elif [ "$1" = "configure" -a -n "$2" ]; then
    upgradeFromVersion="$2"
    after_upgrade "$2"
fi