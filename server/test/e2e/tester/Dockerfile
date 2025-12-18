FROM debian:stable-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    openssh-client \
    sshpass \
    ca-certificates \
    bash \
    grep && \
    rm -rf /var/lib/apt/lists/*
CMD ["bash", "-lc", "echo tester ready"]
