# Use an official Debian base image
FROM debian:latest

# Copy environment variables
COPY ldap_env.sh /tmp/ldap_env.sh
RUN chmod +x /tmp/ldap_env.sh && . /tmp/ldap_env.sh

# Reinitialize dpkg info database to avoid corruption
RUN rm -rf /var/lib/dpkg/info/* && dpkg --configure -a 
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
    openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# SSH Configuration
RUN [ ! -d /var/run/sshd ] && mkdir /var/run/sshd || echo "/var/run/sshd already exists" && \
    echo "Port 2222" >> /etc/ssh/sshd_config && \
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

# COPY certificates/ /certificates/

# Configure LDAP client
RUN echo "BASE    dc=mieweb,dc=com" > /etc/ldap/ldap.conf && \
    echo "URI     ldap://app:389" >> /etc/ldap/ldap.conf && \
    echo "BINDDN  dc=mieweb,dc=com" >> /etc/ldap/ldap.conf && \
    echo "TLS_REQCERT allow" >> /etc/ldap/ldap.conf

# Configure SSSD
COPY sssd.conf /etc/sssd/sssd.conf
RUN chmod 600 /etc/sssd/sssd.conf

# Set proper permissions for LDAP directories
RUN chown -R openldap:openldap /etc/ldap/slapd.d && \
    chmod -R 750 /etc/ldap/slapd.d

# Expose port for SSH
EXPOSE 2222

# Start services
CMD service ssh start && tail -f /dev/null


