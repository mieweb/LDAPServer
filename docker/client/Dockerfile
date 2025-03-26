# Use an official Debian base image
FROM debian:latest

# Reinitialize dpkg info database to avoid corruption
RUN rm -rf /var/lib/dpkg/info/* && dpkg --configure -a 

# Copy environment variables
COPY ldap_env.sh /tmp/ldap_env.sh
RUN chmod +x /tmp/ldap_env.sh && . /tmp/ldap_env.sh

# Accept the CA certificate as a build argument
ARG LDAP_CA_CERT

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
    echo 'UsePAM yes' >> /etc/ssh/sshd_config && \
    echo 'AllowGroups developers devops' >> /etc/ssh/sshd_config && \
    echo 'LoginGraceTime 90' >> /etc/ssh/sshd_config && \
    echo 'MaxAuthTries 3' >> /etc/ssh/sshd_config && \
    echo 'ClientAliveInterval 15' >> /etc/ssh/sshd_config

# Create local groups with EXACT GIDs from LDAP
RUN groupadd -g 5000 developers && \
    groupadd -g 5001 sysadmins && \
    groupadd -g 5002 devops

# Enable pam_mkhomedir to create home directories on login
RUN echo "session required pam_mkhomedir.so skel=/etc/skel umask=0077" >> /etc/pam.d/sshd && \
    echo "auth required pam_faildelay.so delay=5000000" >> /etc/pam.d/sshd

# Set up directory to store certificates
RUN mkdir -p /certificates

# Configure LDAP client
RUN . /tmp/ldap_env.sh && \ 
    echo "BASE    $LDAP_BASE" > /etc/ldap/ldap.conf && \
    echo "URI     $LDAP_URI" >> /etc/ldap/ldap.conf && \
    echo "BINDDN  $LDAP_BASE" >> /etc/ldap/ldap.conf && \
    echo "TLS_CACERT $LDAP_CERT" >> /etc/ldap/ldap.conf && \
    echo "TLS_REQCERT allow" >> /etc/ldap/ldap.conf

# Copy the CA certificate content from the environment variable
RUN echo "$LDAP_CA_CERT" > /certificates/ca-cert.pem && \
    chmod 644 /certificates/ca-cert.pem

# Configure SSSD
COPY sssd.conf /etc/sssd/sssd.conf
RUN chmod 600 /etc/sssd/sssd.conf

# Set proper permissions for LDAP directories
RUN chown -R openldap:openldap /etc/ldap/slapd.d && \
    chmod -R 750 /etc/ldap/slapd.d

# Expose port for SSH
EXPOSE $SSH_PORT

# Start services
CMD service ssh start && /usr/sbin/sssd -i -d 9 && tail -f /dev/null
