output "ldap_server_public_ip" {
  value = aws_instance.ldap_server.public_ip
}
