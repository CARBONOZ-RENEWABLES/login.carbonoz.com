# Deployment Guide for login.carbonoz.com

## Server Setup (192.168.160.190)

### 1. Install Required Software

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
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

# Install Nginx
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Install PM2 globally
sudo npm install -g pm2
```

### 2. Configure MongoDB Replica Set

```bash
# Edit MongoDB config
sudo nano /etc/mongod.conf

# Add these lines:
replication:
  replSetName: "rs0"

# Restart MongoDB
sudo systemctl restart mongod

# Initialize replica set
mongosh
> rs.initiate()
> exit
```

### 3. Clone and Setup Application

```bash
# Clone repository
cd /var/www
sudo git clone https://github.com/CARBONOZ-RENEWABLES/login.carbonoz.com.git
cd login.carbonoz.com

# Set permissions
sudo chown -R $USER:$USER /var/www/login.carbonoz.com

# Make deploy script executable
chmod +x deploy.sh
```

### 4. Configure Environment Variables

**Backend (.env in server-api/):**
```bash
cd server-api
cp .env.example .env
nano .env
```

Update with production values:
```env
DATABASE_URL="mongodb://localhost:27017/carbonoz?replicaSet=rs0"
JWT_SECRET="generate-a-strong-secret-key-here"
NODE_ENV=production
PORT=3000
REDIS_URL=redis://192.168.160.155
FRONTED_URL=http://login.carbonoz.com
```

**Frontend (.env in offsettingdashboard/):**
```bash
cd ../offsettingdashboard
nano .env
```

Update:
```env
VITE_API_URL=http://192.168.160.190:3000/api
```

### 5. Configure Nginx

```bash
# Copy nginx config
sudo cp nginx.conf /etc/nginx/sites-available/login.carbonoz.com

# Create symbolic link
sudo ln -s /etc/nginx/sites-available/login.carbonoz.com /etc/nginx/sites-enabled/

# Remove default config
sudo rm /etc/nginx/sites-enabled/default

# Test nginx config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 6. Configure DNS/Hosts

Add to `/etc/hosts` on the server:
```bash
sudo nano /etc/hosts
```

Add:
```
192.168.160.190 login.carbonoz.com
```

For client machines accessing the app, add the same entry to their hosts file:
- **Linux/Mac:** `/etc/hosts`
- **Windows:** `C:\Windows\System32\drivers\etc\hosts`

### 7. Deploy Application

```bash
cd /var/www/login.carbonoz.com
./deploy.sh
```

### 8. Setup PM2 Startup

```bash
# Generate startup script
pm2 startup

# Copy and run the command it outputs (will be something like):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u username --hp /home/username

# Save PM2 process list
pm2 save
```

## Management Commands

### Check Application Status
```bash
pm2 status
pm2 logs
pm2 logs carbonoz-api
pm2 logs carbonoz-frontend
```

### Restart Applications
```bash
pm2 restart ecosystem.config.js
pm2 restart carbonoz-api
pm2 restart carbonoz-frontend
```

### Stop Applications
```bash
pm2 stop ecosystem.config.js
```

### Update Application
```bash
cd /var/www/login.carbonoz.com
git pull origin main
./deploy.sh
```

## Firewall Configuration

```bash
# Allow necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS (for future SSL)
sudo ufw enable
```

## Access URLs

- **Frontend:** http://login.carbonoz.com or http://192.168.160.190
- **Backend API:** http://192.168.160.190:3000/api
- **API Docs:** http://192.168.160.190:3000/api/docs

## Troubleshooting

### Check if services are running
```bash
sudo systemctl status mongod
sudo systemctl status redis-server
sudo systemctl status nginx
pm2 status
```

### View logs
```bash
pm2 logs
sudo tail -f /var/log/nginx/error.log
sudo journalctl -u mongod -f
```

### Restart services
```bash
sudo systemctl restart mongod
sudo systemctl restart redis-server
sudo systemctl restart nginx
pm2 restart all
```

## SSL Certificate (Optional - for HTTPS)

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate (requires domain to point to server)
sudo certbot --nginx -d login.carbonoz.com

# Auto-renewal is configured automatically
```
