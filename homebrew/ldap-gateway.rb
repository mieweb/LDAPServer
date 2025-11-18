class LdapGateway < Formula
  desc "LDAP Gateway Server - Bridge LDAP authentication to various backends"
  homepage "https://github.com/mieweb/LDAPServer"
  url "https://github.com/mieweb/LDAPServer/archive/v1.0.0.tar.gz"
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"

  depends_on "node@18"

  def install
    # Install all files to libexec
    libexec.install Dir["*"]
    
    # Install dependencies
    cd libexec/"server" do
      system "npm", "install", "--production"
      system "npm", "run", "build"
    end

    # Create wrapper script
    (bin/"ldap-gateway").write <<~EOS
      #!/bin/bash
      cd "#{libexec}/server/dist" && exec ./ldap-gateway "$@"
    EOS

    # Install config template
    (etc/"ldap-gateway").mkpath
    cp libexec/"server/.env.example", etc/"ldap-gateway/.env.example"
  end

  def caveats
    <<~EOS
      Configuration template installed to:
        #{etc}/ldap-gateway/.env.example

      Copy this to ~/.ldap-gateway.env or /usr/local/etc/ldap-gateway/.env
      and customize for your environment.

      To start the service:
        ldap-gateway

      For background service, create a LaunchAgent:
        brew services start ldap-gateway
    EOS
  end

  service do
    run [opt_bin/"ldap-gateway"]
    environment_variables PATH: std_service_path_env
    keep_alive true
    log_path var/"log/ldap-gateway.log"
    error_log_path var/"log/ldap-gateway-error.log"
    working_dir HOMEBREW_PREFIX/"var"
  end

  test do
    # Test that the binary exists and can show help
    system bin/"ldap-gateway", "--help"
  end
end