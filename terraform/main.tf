resource "aws_security_group" "ldap_sg" {
  name        = "ldap-security-group"
  description = "Allow LDAP, API, SSH, and Client"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 636
    to_port     = 636
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 2222
    to_port     = 2222
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "ldap_server" {
  ami             = var.ami_id
  instance_type   = var.instance_type
  key_name        = var.key_name
  security_groups = [aws_security_group.ldap_sg.name]

  tags = {
    Name = "LDAPServer"
  }

  lifecycle {
    create_before_destroy = true
  }

  user_data = <<-EOF
              #!/bin/bash
              sudo yum update -y
              sudo yum install -y git
              curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
              sudo yum install -y nodejs
              EOF
}

resource "aws_instance" "ldap_client" {
  ami             = var.ami_id
  instance_type   = var.instance_type
  key_name        = var.key_name
  security_groups = [aws_security_group.ldap_sg.name]

  tags = {
    Name = "LDAPClient"
  }

  lifecycle {
    create_before_destroy = true
  }

  user_data = <<-EOF
              #!/bin/bash
              sudo yum update -y
              sudo yum install -y docker
              sudo systemctl start docker
              sudo systemctl enable docker
              aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 476114118524.dkr.ecr.us-east-1.amazonaws.com
              docker pull 476114118524.dkr.ecr.us-east-1.amazonaws.com/ldap-client:latest
              docker run -d -p 2222:2222 476114118524.dkr.ecr.us-east-1.amazonaws.com/ldap-client
              EOF
}

output "ldap_server_public_ip" {
  value = aws_instance.ldap_server.public_ip
}

output "ldap_client_public_ip" {
  value = aws_instance.ldap_client.public_ip
}
