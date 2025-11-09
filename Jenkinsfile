pipeline {
    agent any

    environment {
        NOTIFIER_DIR = '/opt/sqli-notifier'
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
                withCredentials([file(credentialsId: 'SQLI_NOTIFIER_ENV', variable: 'ENV_FILE')]) {
                    sh '''
                        sudo systemctl stop sqli-notifier || true

                        sudo chown -R jenkins:jenkins /opt/sqli-notifier
                        sudo rsync -av --delete ./ /opt/sqli-notifier/

                        cd /opt/sqli-notifier

                        npm install --no-fund --no-audit

                        # Salin secret file .env ke direktori aplikasi
                        cp "$ENV_FILE" .env
                        chmod 600 .env

                        sudo systemctl daemon-reload
                        sudo systemctl enable --now sqli-notifier
                    '''
                }
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