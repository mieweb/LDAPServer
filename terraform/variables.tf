variable "aws_region" {
  default = "us-east-1"
}

variable "instance_type" {
  default = "t2.micro"
}

variable "os_filter" {
  default = "al2023-ami-*-x86_64"
}

variable "owners" {
  default = "137112412989" # Amazon Linux owner ID
}

variable "key_name" {
  default = "mietest"
}
