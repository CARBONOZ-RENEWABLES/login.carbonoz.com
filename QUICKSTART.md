# Quick Start Guide

## 🚀 Push to GitHub

```bash
cd /Users/elite/Desktop/login.carbonoz.com

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Carbonoz login application"

# Add remote repository
git remote add origin https://github.com/CARBONOZ-RENEWABLES/login.carbonoz.com.git

# Push to GitHub
git push -u origin main
```

If you get an error about the branch name, use:
```bash
git branch -M main
git push -u origin main
```

## 🖥️ Deploy on Server (192.168.160.190)

### On Your Server:

1. **SSH into your server:**
```bash
ssh user@192.168.160.190
```

2. **Install prerequisites (one-time setup):**
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Install Redis
sudo apt install -y redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx
```

3. **Configure MongoDB replica set:**
```bash
sudo nano /etc/mongod.conf
```
Add:
```yaml
replication:
  replSetName: "rs0"
```
Then:
```bash
sudo systemctl restart mongod
mongosh
> rs.initiate()
> exit
```

4. **Clone and deploy:**
```bash
cd /var/www
sudo git clone https://github.com/CARBONOZ-RENEWABLES/login.carbonoz.com.git
cd login.carbonoz.com
sudo chown -R $USER:$USER /var/www/login.carbonoz.com

# Configure environment
cd server-api
cp .env.production .env
nano .env  # Update with your actual values

cd ../offsettingdashboard
cp .env.production .env
nano .env  # Update if needed

# Deploy
cd ..
chmod +x deploy.sh
./deploy.sh
```

5. **Configure Nginx:**
```bash
sudo cp nginx.conf /etc/nginx/sites-available/login.carbonoz.com
sudo ln -s /etc/nginx/sites-available/login.carbonoz.com /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

6. **Configure hosts file:**
```bash
sudo nano /etc/hosts
```
Add:
```
192.168.160.190 login.carbonoz.com
```

7. **Setup PM2 startup:**
```bash
pm2 startup
# Run the command it outputs
pm2 save
```

## ✅ Access Your Application

- **Frontend:** http://login.carbonoz.com or http://192.168.160.190
- **Backend API:** http://192.168.160.190:3000/api
- **API Docs:** http://192.168.160.190:3000/api/docs

## 📊 Management Commands

```bash
# Check status
pm2 status

# View logs
pm2 logs

# Restart
pm2 restart all

# Stop
pm2 stop all

# Update app (after git push)
cd /var/www/login.carbonoz.com
git pull
./deploy.sh
```

## 🔧 Troubleshooting

```bash
# Check services
sudo systemctl status mongod
sudo systemctl status redis-server
sudo systemctl status nginx
pm2 status

# View logs
pm2 logs
sudo tail -f /var/log/nginx/error.log

# Restart everything
sudo systemctl restart mongod
sudo systemctl restart redis-server
sudo systemctl restart nginx
pm2 restart all
```

## 📝 Important Notes

1. Update `.env` files with real credentials before deploying
2. Change JWT_SECRET to a strong random string
3. Configure PayPal and Stripe keys for payments
4. Add `192.168.160.190 login.carbonoz.com` to client machines' hosts file
5. For production, consider setting up SSL with Let's Encrypt

## 🔄 Update Workflow

```bash
# On your local machine
git add .
git commit -m "Your changes"
git push

# On server
cd /var/www/login.carbonoz.com
git pull
./deploy.sh
```
