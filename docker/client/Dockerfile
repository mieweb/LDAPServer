# Use an official Debian base image
FROM debian:latest

# Copy environment variables
COPY ldap_env.sh /tmp/ldap_env.sh
RUN chmod +x /tmp/ldap_env.sh && . /tmp/ldap_env.sh

# Install necessary packages
RUN apt-get update && \
    apt-get install -y \
    slapd \
    ldap-utils \
    openssh-server \
    sssd \
    sssd-ldap \
    sudo \
    vim \
    net-tools \
    procps \
    traceroute \
    tcpdump \
    openssl

# SSH Configuration
RUN [ ! -d /var/run/sshd ] && mkdir /var/run/sshd || echo "/var/run/sshd already exists" && \
    . /tmp/ldap_env.sh && \
    echo "Port $SSH_PORT" >> /etc/ssh/sshd_config && \
    echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config && \
    echo 'PasswordAuthentication yes' >> /etc/ssh/sshd_config && \
    echo 'UsePAM yes' >> /etc/ssh/sshd_config


# Create a local user 'mie' with password 'mie' and sudo privileges
RUN useradd -m -s /bin/bash mie && \
    echo 'mie:mie' | chpasswd && \
    echo 'mie ALL=(ALL:ALL) NOPASSWD:ALL' >> /etc/sudoers.d/mie

# LDAP Configuration
COPY users.ldif /etc/ldap/users.ldif
COPY setup.ldif /etc/ldap/setup.ldif

# Configure LDAP client
RUN . /tmp/ldap_env.sh && \
    echo "BASE    $LDAP_BASE" > /etc/ldap/ldap.conf && \
    echo "URI     $LDAP_URI" >> /etc/ldap/ldap.conf && \
    echo "BINDDN  $LDAP_ADMIN_DN" >> /etc/ldap/ldap.conf && \
    echo "TLS_REQCERT allow" >> /etc/ldap/ldap.conf

# Set environment variables for LDAP
ENV DEBIAN_FRONTEND=noninteractive

# Pre-configure the slapd package
RUN . /tmp/ldap_env.sh && \
    echo "slapd slapd/internal/generated_adminpw password $LDAP_ADMIN_PW" | debconf-set-selections && \
    echo "slapd slapd/internal/adminpw password $LDAP_ADMIN_PW" | debconf-set-selections && \
    echo "slapd slapd/password2 password $LDAP_ADMIN_PW" | debconf-set-selections && \
    echo "slapd slapd/password1 password $LDAP_ADMIN_PW" | debconf-set-selections && \
    echo "slapd slapd/domain string $LDAP_DOMAIN" | debconf-set-selections && \
    echo "slapd shared/organization string $LDAP_ORG" | debconf-set-selections && \
    dpkg-reconfigure -f noninteractive slapd

# Add LDAP users via LDIF files
RUN slapadd < /etc/ldap/users.ldif

# Configure SSSD
COPY sssd.conf /etc/sssd/sssd.conf
RUN chmod 600 /etc/sssd/sssd.conf

# Configure LDAP TLS settings
COPY enable-tls.ldif /etc/ldap/enable-tls.ldif

# Set appropriate permissions for LDAP directories
RUN chown -R openldap:openldap /etc/ldap/slapd.d && \
    chmod -R 750 /etc/ldap/slapd.d && \
    chmod 755 /etc/ssl/private && \
    chmod 755 /etc/ssl/certs

# Generate certificates for TLS
RUN . /tmp/ldap_env.sh && \
    openssl req -new -x509 -nodes -out /etc/ssl/certs/ldap-cert.pem -keyout /etc/ssl/private/ldap-key.pem -days 365 \
    -subj "$LDAP_CERT_SUBJ" && \
    cp /etc/ssl/certs/ldap-cert.pem /etc/ssl/certs/ca-cert.pem && \
    chown openldap:openldap /etc/ssl/certs/ldap-cert.pem /etc/ssl/private/ldap-key.pem /etc/ssl/certs/ca-cert.pem && \
    chmod 600 /etc/ssl/private/ldap-key.pem && \
    chmod 644 /etc/ssl/certs/ldap-cert.pem /etc/ssl/certs/ca-cert.pem

# Apply TLS configuration
RUN slapd -h "ldapi:///" -u openldap -g openldap -d 256 & \
    sleep 5 && \
    ldapmodify -H ldapi:/// -Y EXTERNAL -f /etc/ldap/enable-tls.ldif && \
    killall slapd && \
    chmod 640 /etc/ssl/private/ldap-key.pem

# Start services and set permissions
CMD service slapd start && \
    service ssh start && \
    service sssd start && \
    bash
