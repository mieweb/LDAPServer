resource "aws_instance" "ldap_server" {
  ami           = var.ami_id
  instance_type = var.instance_type
  key_name      = "your-ec2-key"
  tags = {
    Name = "LDAPServer"
  }

  user_data = <<-EOF
              #!/bin/bash
              sudo yum update -y
              sudo yum install -y git nodejs
              git clone https://github.com/anishapant21/LDAPServer.git /home/ec2-user/LDAPServer
              cd /home/ec2-user/LDAPServer
              npm install
              nohup node server.js > server.log 2>&1 &
              EOF
}
