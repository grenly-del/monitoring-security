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
                    # Hentikan service
                    systemctl --user stop sqli-notifier || true

                    # Deploy (tanpa sudo, karena folder milik jenkins)
                    rsync -av --delete ./ $NOTIFIER_DIR/

                    cd $NOTIFIER_DIR

                    # Install dependensi
                    npm install --no-fund --no-audit

                    # Buat .env
                    cat > .env <<EOL
GEMINI_API_KEY=$GEMINI_API_KEY
FONNTE_TOKEN=$FONNTE_TOKEN
WHATSAPP_TARGET=$WHATSAPP_TARGET
LOG_PATH=/var/log/modsec_audit.log
EOL

                    chmod 600 .env

                    # Mulai ulang service
                    systemctl --user daemon-reload
                    systemctl --user enable --now sqli-notifier
                '''
            }
        }

        stage('Verify') {
            steps {
                sh 'systemctl --user is-active sqli-notifier'
                sh 'journalctl --user -u sqli-notifier -n 10 --no-pager'
            }
        }
    }
}