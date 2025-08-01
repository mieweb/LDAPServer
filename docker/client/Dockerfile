# Use an official Debian base image
FROM debian:latest

# Copy environment file
COPY .env /.env
RUN chmod +x /.env

# Install necessary packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    slapd \
    ldap-utils \
    openssh-server \
    sssd \
    sssd-ldap \
    sudo \
    vim \
    openssl \
    net-tools \
    iputils-ping \
    procps \
    traceroute \
    tcpdump \
    openssl \
    gettext && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# SSH Configuration
RUN [ ! -d /var/run/sshd ] && mkdir /var/run/sshd || echo "/var/run/sshd already exists" && \
    echo "Port 2222" >> /etc/ssh/sshd_config && \
    echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config && \
    echo 'PasswordAuthentication yes' >> /etc/ssh/sshd_config && \
    echo 'UsePAM yes' >> /etc/ssh/sshd_config && \
    # echo 'AllowGroups developers devops' >> /etc/ssh/sshd_config && \
    echo 'LoginGraceTime 90' >> /etc/ssh/sshd_config && \
    echo 'MaxAuthTries 3' >> /etc/ssh/sshd_config && \
    echo 'ClientAliveInterval 15' >> /etc/ssh/sshd_config

# Create local groups with EXACT GIDs from LDAP
# RUN groupadd -g 5000 developers && \
#     groupadd -g 5001 sysadmins && \
#     groupadd -g 5002 devops

# Enable pam_mkhomedir to create home directories on login
RUN echo "session required pam_mkhomedir.so skel=/etc/skel umask=0077" >> /etc/pam.d/sshd && \
    echo "auth required pam_faildelay.so delay=5000000" >> /etc/pam.d/sshd

# Set up directory to store certificates
RUN mkdir -p /certificates

# Copy the SSSD config template
COPY sssd.conf.template /etc/sssd/sssd.conf.template

# Create a startup script that will be used at container start
RUN echo '#!/bin/bash' > /start.sh && \
    echo 'set -a' >> /start.sh && \
    echo '. /.env' >> /start.sh && \
    echo 'set +a' >> /start.sh && \
    echo 'echo "BASE $LDAP_BASE" > /etc/ldap/ldap.conf' >> /start.sh && \
    echo 'echo "URI $LDAP_URI" >> /etc/ldap/ldap.conf' >> /start.sh && \
    echo 'echo "BINDDN $LDAP_BASE" >> /etc/ldap/ldap.conf' >> /start.sh && \
    echo 'echo "TLS_CACERT $LDAP_CERT" >> /etc/ldap/ldap.conf' >> /start.sh && \
    echo 'echo "TLS_REQCERT allow" >> /etc/ldap/ldap.conf' >> /start.sh && \
    echo 'echo "$LDAP_CA_CERT" > /certificates/ca-cert.pem' >> /start.sh && \
    echo 'chmod 644 /certificates/ca-cert.pem' >> /start.sh && \
    echo 'cat /etc/sssd/sssd.conf.template | sed "s|\${LDAP_URI}|$LDAP_URI|g" | sed "s|\${LDAP_BASE}|$LDAP_BASE|g" > /etc/sssd/sssd.conf' >> /start.sh && \
    echo 'chmod 600 /etc/sssd/sssd.conf' >> /start.sh && \
    echo 'service ssh start' >> /start.sh && \
    echo '/usr/sbin/sssd -i -d 9' >> /start.sh && \
    echo 'tail -f /dev/null' >> /start.sh && \
    chmod +x /start.sh

# Set proper permissions for LDAP directories
RUN chown -R openldap:openldap /etc/ldap/slapd.d && \
    chmod -R 750 /etc/ldap/slapd.d

# Expose port for SSH
EXPOSE 2222

# Start services using the embedded startup script
CMD ["/start.sh"]