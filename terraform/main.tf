resource "aws_security_group" "ldap_sg" {
  name        = "ldap-security-group"
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

# Security group for the client instance
resource "aws_security_group" "client_sg" {
  name        = "client-security-group"
  description = "Allow SSH and port 2222 for client"

  ingress {
    from_port   = 22
    to_port     = 22
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

# EC2 instance for client
resource "aws_instance" "client_instance" {
  ami             = var.ami_id
  instance_type   = var.instance_type
  key_name        = var.key_name
  security_groups = [aws_security_group.client_sg.name]

  tags = {
    Name = "LDAPClient"
  }

  user_data = <<-EOF
              #!/bin/bash
              sudo yum update -y
              sudo yum install -y docker
              sudo systemctl enable docker
              sudo systemctl start docker
              sudo usermod -aG docker ec2-user

              # Authenticate to AWS ECR
              aws ecr get-login-password --region us-east-1 | sudo docker login --username AWS --password-stdin 476114118524.dkr.ecr.us-east-1.amazonaws.com

              # Pull and run the client container
              sudo docker pull 476114118524.dkr.ecr.us-east-1.amazonaws.com/ldap-client:latest
              sudo docker run -d -p 2222:2222 476114118524.dkr.ecr.us-east-1.amazonaws.com/ldap-client:latest
              EOF
}

output "ldap_server_public_ip" {
  value = aws_instance.ldap_server.public_ip
}

output "client_instance_public_ip" {
  value = aws_instance.client_instance.public_ip
}
