resource "aws_security_group" "ldap_sg" {
  name        = "ldap-security-group-new"  # Changed name to be unique
  description = "Allow LDAP, API, and SSH (for deployments)"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Change later to GitHub Actions IPs
  }

  ingress {
    from_port   = 636
    to_port     = 636
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Allow LDAP connections
  }

  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Allow API access
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "ldap_server" {
  ami             = "ami-08b5b3a93ed654d19"
  instance_type   = "t2.micro"
  key_name        = "mietest"
  security_groups = [aws_security_group.ldap_sg.name]

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

# Add output to display the public IP address
output "ldap_server_public_ip" {
  value = aws_instance.ldap_server.public_ip
  description = "The public IP address of the LDAP server"
}