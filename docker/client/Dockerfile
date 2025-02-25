# Use an official Debian base image
FROM debian:latest

# Reinitialize dpkg info database to avoid corruption
RUN rm -rf /var/lib/dpkg/info/* && dpkg --configure -a 

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
    echo 'AllowGroups developers devops' >> /etc/ssh/sshd_config


# Create local groups with EXACT GIDs from LDAP
RUN groupadd -g 5000 developers && \
    groupadd -g 5002 devops

# Enable pam_mkhomedir to create home directories on login
RUN echo "session required pam_mkhomedir.so skel=/etc/skel umask=0077" >> /etc/pam.d/sshd

# Set up directory to store certificates
RUN mkdir -p /certificates

# Configure LDAP client
RUN echo "BASE    dc=mieweb,dc=com" > /etc/ldap/ldap.conf && \
    echo "URI     ldaps://host.docker.internal:636" >> /etc/ldap/ldap.conf && \
    echo "BINDDN  dc=mieweb,dc=com" >> /etc/ldap/ldap.conf && \
    echo "TLS_CACERT /certificates/ca-cert.pem" >> /etc/ldap/ldap.conf && \
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
EXPOSE 2222

# Start services
CMD service ssh start && /usr/sbin/sssd -i -d 9 && tail -f /dev/null
