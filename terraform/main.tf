resource "aws_security_group" "ldap_sg" {
  name        = "ldap-security-group"
  description = "Allow LDAP, API, and SSH (for deployments)"
  
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
              
              if [ -d "/home/ec2-user/LDAPServer" ]; then
                sudo rm -rf /home/ec2-user/LDAPServer
              fi
              
              sudo mkdir -p /home/ec2-user/LDAPServer
              sudo chown -R ec2-user:ec2-user /home/ec2-user/LDAPServer
              EOF
}