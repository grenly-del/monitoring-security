pipeline {
    agent any

    environment {
        NOTIFIER_DIR = '/opt/sqli-notifier'
        GEMINI_API_KEY = credentials('GEMINI_API_KEY')
        FONNTE_TOKEN   = credentials('FONNTE_TOKEN')
        WHATSAPP_TARGET = credentials('WHATSAPP_TARGET')
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/grenly-del/monitoring-security.git',
                    credentialsId: 'GITHUB_KEY'
            }
        }

        stage('Deploy to VPS') {
            steps {
                sh '''
                    # Hentikan service lama
                    sudo systemctl stop sqli-notifier || true

                    # Deploy
                    sudo rsync -av --delete ./ $NOTIFIER_DIR/

                    cd $NOTIFIER_DIR

                    # Install
                    sudo -u jenkins npm install --no-fund --no-audit

                    # Buat .env
                    sudo -u jenkins cat > .env <<EOL
GEMINI_API_KEY=$GEMINI_API_KEY
FONNTE_TOKEN=$FONNTE_TOKEN
WHATSAPP_TARGET=$WHATSAPP_TARGET
LOG_PATH=/var/log/modsec_audit.log
EOL

                    sudo chmod 600 .env
                    sudo chown jenkins:jenkins .env

                    # Reload systemd & jalankan
                    sudo systemctl daemon-reload
                    sudo systemctl enable --now sqli-notifier
                '''
            }
        }

        stage('Verify') {
            steps {
                sh 'sudo systemctl is-active sqli-notifier'
                sh 'sudo journalctl -u sqli-notifier -n 10 --no-pager'
            }
        }
    }
}