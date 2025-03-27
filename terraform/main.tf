resource "aws_security_group" "ldap_sg" {
  name        = "newestj-tin-sd-top-ldap-security-group"
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
  
  # Added lifecycle configuration to replace the instance
  lifecycle {
    create_before_destroy = true
  }

  user_data = <<-EOF
              #!/bin/bash
              # Just install system dependencies
              sudo yum update -y
              sudo yum install -y git
              curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
              sudo yum install -y nodejs
              
              # Prepare the directory - will be populated by GitHub Actions
              if [ -d "/home/ec2-user/LDAPServer" ]; then
                sudo rm -rf /home/ec2-user/LDAPServer
              fi
              
              sudo mkdir -p /home/ec2-user/LDAPServer
              sudo chown -R ec2-user:ec2-user /home/ec2-user/LDAPServer
              EOF
}