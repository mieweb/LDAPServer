FROM debian:stable-slim

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    openssh-server \
    sssd \
    sssd-ldap \
    ldap-utils \
    sshpass \
    procps \
    iproute2 \
    net-tools && \
    rm -rf /var/lib/apt/lists/*

# SSH Configuration
RUN mkdir -p /var/run/sshd && \
    echo "Port 2222" >> /etc/ssh/sshd_config && \
    echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config && \
    echo 'PasswordAuthentication yes' >> /etc/ssh/sshd_config && \
    echo 'UsePAM yes' >> /etc/ssh/sshd_config && \
    echo 'LoginGraceTime 30' >> /etc/ssh/sshd_config && \
    echo 'MaxAuthTries 3' >> /etc/ssh/sshd_config

# PAM: create home dirs for LDAP users
RUN echo "session required pam_mkhomedir.so skel=/etc/skel umask=0077" >> /etc/pam.d/sshd

# NSS switch to use SSSD for passwd/group
RUN sed -i 's/^passwd:.*/passwd:         files sss/' /etc/nsswitch.conf && \
    sed -i 's/^group:.*/group:          files sss/' /etc/nsswitch.conf && \
    sed -i 's/^shadow:.*/shadow:         files sss/' /etc/nsswitch.conf

# SSSD configuration
COPY sssd.conf /etc/sssd/sssd.conf
RUN chmod 600 /etc/sssd/sssd.conf

# Prepare a local test user for SSH root management (not used for LDAP auth)
RUN useradd -m -s /bin/bash localadmin && echo 'localadmin:localpass' | chpasswd

# Pre-create home directory for testuser to avoid warnings
RUN mkdir -p /home/testuser && chmod 755 /home/testuser

EXPOSE 2222

CMD service ssh start && /usr/sbin/sssd -i -d 9
