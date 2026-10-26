#!/usr/bin/env bash
# VPS Project Generator 1.2.0 — review before running. Optional browser OS dependencies and user-local PM2; review capabilities.
# shellcheck disable=SC1112
# French diagnostic strings intentionally contain typographic apostrophes.
set -Eeuo pipefail
umask 027

PROJECT='seo'
TYPE='nextjs'
MAIN_DOMAIN='seo.404notfood.fr'
PHP_VERSION=''
NODE_MAJOR='24'
PM_REQUEST='npm'
DATABASE='postgresql'
DB_NAME='seo'
SOURCE='git'
REPOSITORY='https://github.com/404notfood/404seo.git'
BRANCH='main'
ARCHIVE=''
LAYOUT='simple'
APP='/home/seo/app'
PROJECT_HOME='/home/seo'
SHARED='/home/seo/shared'
HTTPS='1'
EMAIL='contact@404notfood.fr'
SSH_ENABLED='1'
SSH_AUTH='key'
PUBLIC_KEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOKy8QV2g5I7jCKecUCuPJyS3x154kuHgQK1D0zKrKwG eddsa-key-20261025'
PORT_MODE='manual'
REQUESTED_PORT='3030'
REDIS_ENABLED='1'
ENV_NAME='.env.production'
ENV_EXAMPLE='deployment/.env.example'
SUPERVISOR='pm2'
IDENTITY='seo:nextjs:simple:postgresql::24:ssr:.env.production:site:standalone:pm2:dedicated'
DOMAINS=('seo.404notfood.fr')
DECLARED_PORTS=(4000)

STATE="/var/lib/vps-projects/$PROJECT"
LOG="/var/log/vps-projects/$PROJECT.log"
BACKUP="/var/backups/vps-projects/$PROJECT/$(date -u +%Y%m%dT%H%M%SZ)-$$"
BACKUP_ROOT=$BACKUP
CONFIG_PHASE=0
TMP=''
NODE_BIN=''


PORT=''
REDIS_PORT=''
CHANGED=()
ENABLED_UNITS=()
RESTARTED_UNITS=()
STARTED_UNITS=()
REMOVED_ENABLED_UNITS=()
COMMITTED=0
SSH_RELOAD_REQUIRED=0
PROJECT_SHELL_CHANGED=0
PROJECT_SHELL_BEFORE=''
CURRENT_STAGE=preflight

log() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
error() { printf '[ERROR] %s\n' "$*" >&2; }
die() { error "$*"; exit 1; }
command_exists() { command -v "$1" >/dev/null 2>&1; }
file_hash() { sha256sum -- "$1" | awk '{print $1}'; }
record_for() { printf '%s/files/%s' "$STATE" "$(printf '%s' "$1" | sha256sum | awk '{print $1}')"; }
safe_file() { [[ ! -L $1 && ( ! -e $1 || -f $1 ) ]] || die "Fichier non régulier ou lien interdit : $1"; }
backup_file() {
    local path=$1
    safe_file "$path"
    if [[ -e $path ]]; then
        install -d -m 0700 "$BACKUP$(dirname "$path")"
        cp -a -- "$path" "$BACKUP$path"
    fi
}
assert_managed() {
    local path=$1 record
    safe_file "$path"
    record=$(record_for "$path")
    if [[ -e $path ]]; then
        [[ -f $record && ! -L $record && $(stat -c %u "$path") == 0 ]] || die "Configuration inconnue, refus d'écraser : $path"
        [[ $(file_hash "$path") == "$(cat "$record")" ]] || die "Configuration modifiée manuellement : $path. Sauvegarder puis réconcilier le registre root avant relance."
    elif [[ -e $record ]]; then
        die "Configuration gérée manquante : $path"
    fi
}
managed_write() {
    local path=$1 mode=0644 group=root candidate record
    if (( $# > 1 )); then mode=$2; fi
    if (( $# > 2 )); then group=$3; fi
    assert_managed "$path"
    candidate=$(mktemp "$TMP/config.XXXXXX")
    cat > "$candidate"
    if [[ -e $path ]] && cmp -s -- "$path" "$candidate"; then return 0; fi
    record=$(record_for "$path")
    if [[ " ${CHANGED[*]} " != *" $path "* ]]; then
        backup_file "$path"
        if [[ -f $record ]]; then
            install -d -m 0700 "$BACKUP/records"
            cp -a -- "$record" "$BACKUP/records/$(basename "$record")"
        fi
        CHANGED+=("$path")
    fi
    install -d -m 0755 "$(dirname "$path")"
    install -o root -g "$group" -m "$mode" "$candidate" "$path.vps-new"
    mv -Tf -- "$path.vps-new" "$path"
    file_hash "$path" > "$record"
}
rollback() {
    local path record i login_shell permissions
    set +e
    warn "Rollback après étape $CURRENT_STAGE ; fichiers modifiés : ${#CHANGED[@]} ; nouveau lien Nginx : $(if [[ -f $TMP/new-nginx-link ]]; then printf oui; else printf non; fi)."
    if [[ $PROJECT_SHELL_CHANGED == 1 ]]; then usermod --shell /usr/sbin/nologin "$PROJECT" || warn 'Impossible de désactiver temporairement le shell projet.'; fi
    for ((i=${#CHANGED[@]}-1; i>=0; i--)); do
        path=${CHANGED[i]}; record=$(record_for "$path")
        if [[ -f $BACKUP$path ]]; then cp -a -- "$BACKUP$path" "$path"; else rm -f -- "$path"; fi
        if [[ -f $BACKUP/records/$(basename "$record") ]]; then
            cp -a -- "$BACKUP/records/$(basename "$record")" "$record"
        else rm -f -- "$record"; fi
    done
    if [[ $PROJECT_SHELL_CHANGED == 1 ]]; then
        login_shell=/usr/sbin/nologin
        path="/usr/local/libexec/vps-shell-$PROJECT"; record=$(record_for "$path")
        if [[ $PROJECT_SHELL_BEFORE == "$path" && -x $path && ! -L $path && -f $record && ! -L $record && $(stat -c %u "$path") == 0 ]]; then
            permissions=$(stat -c %a "$path")
            if (( (8#$permissions & 8#022) == 0 )) && [[ $(file_hash "$path") == "$(cat "$record")" ]]; then login_shell=$path; fi
        fi
        usermod --shell "$login_shell" "$PROJECT" || warn 'Restauration du shell projet échouée ; vérifier getent passwd.'
    fi
    if [[ -f $TMP/new-nginx-link ]]; then rm -f -- "/etc/nginx/sites-enabled/$PROJECT.conf"; fi
    for path in "${ENABLED_UNITS[@]}"; do systemctl disable --now "$path" >/dev/null 2>&1; done
    for path in "${STARTED_UNITS[@]}"; do systemctl stop "$path" >/dev/null 2>&1; done
    systemctl daemon-reload
    for path in "${REMOVED_ENABLED_UNITS[@]}"; do systemctl enable "$path" >/dev/null 2>&1; done
    for path in "${RESTARTED_UNITS[@]}"; do systemctl restart "$path" || warn "Restauration du service échouée : $path"; done
    nginx -t && systemctl reload nginx
    if [[ -n $PHP_VERSION ]]; then systemctl reload "php$PHP_VERSION-fpm"; fi
    if [[ $SSH_RELOAD_REQUIRED == 1 ]]; then sshd -t && systemctl reload ssh || warn 'Restauration SSH échouée ; vérifier sshd -t.'; fi
    warn "Configurations restaurées. Les données DB, secrets, fichiers applicatifs et comptes sont conservés. Sauvegardes : $BACKUP"
}
on_exit() {
    local code=$?
    trap - EXIT ERR
    if (( code != 0 && COMMITTED == 0 )) && [[ -n $TMP ]]; then rollback; fi
    if [[ -n $TMP && -d $TMP && $TMP == /var/lib/vps-projects/.tmp-* ]]; then rm -r -- "$TMP"; fi
    exit "$code"
}
trap 'error "Échec ligne $LINENO (code $?). Aucun secret ni commande complète affiché. Journal : $LOG ; sauvegardes : $BACKUP"' ERR
trap on_exit EXIT

checkpoint_configuration() {
    # Provisioning survives missing sources or a later build failure. Subsequent
    # writes have a fresh backup scope so rollback restores the provisioned state.
    CHANGED=()
    ENABLED_UNITS=()
    RESTARTED_UNITS=()
    STARTED_UNITS=()
    REMOVED_ENABLED_UNITS=()
    SSH_RELOAD_REQUIRED=0
    PROJECT_SHELL_CHANGED=0
    PROJECT_SHELL_BEFORE=''
    rm -f -- "$TMP/new-nginx-link"
    ((CONFIG_PHASE+=1))
    BACKUP="$BACKUP_ROOT/phase-$CONFIG_PHASE"
    install -d -m 0700 "$BACKUP"
}

as_project() {
    runuser -u "$PROJECT" -- env -i "HOME=$PROJECT_HOME" "USER=$PROJECT" "LOGNAME=$PROJECT" "PM2_HOME=$PROJECT_HOME/.pm2" "LANG=C.UTF-8" "PATH=$PROJECT_HOME/.local/bin:${NODE_BIN:+$NODE_BIN:}/usr/local/bin:/usr/bin:/bin" "$@"
}
set_project_login_shell() {
    if [[ $PROJECT_SHELL_CHANGED == 0 ]]; then
        PROJECT_SHELL_BEFORE=$(getent passwd "$PROJECT" | cut -d: -f7)
        [[ -n $PROJECT_SHELL_BEFORE ]] || die 'Shell précédent du compte projet introuvable.'
        PROJECT_SHELL_CHANGED=1
    fi
    usermod --shell "$1" "$PROJECT"
}
run_stage() {
    CURRENT_STAGE=$1
    printf '%s\n' "$CURRENT_STAGE" > "$STATE/last-stage"
    log "Étape : $CURRENT_STAGE"
    "$@"
    log "Étape terminée : $CURRENT_STAGE"
}
app_command() { as_project /bin/bash -c 'cd -- "$1"; shift; exec "$@"' -- "$APP" "$@"; }

node_command() { app_command "$NODE_BIN/node" "--env-file=$APP/$ENV_NAME" "$@"; }
project_exec() {
    local directory=$1 executable=$2; shift 2
    case $executable in
        node) executable="$NODE_BIN/node" ;;
        npm) set -- "$NODE_BIN/npm" "$@"; executable="$NODE_BIN/node" ;;
        php) executable="/usr/bin/php$PHP_VERSION" ;;
        *) die 'Exécutable de hook non autorisé.' ;;
    esac
    if [[ $executable == "$NODE_BIN/node" ]]; then set -- "--env-file=$APP/$ENV_NAME" "$@"; fi
    as_project /bin/bash -c 'cd -- "$1"; shift; exec "$@"' -- "$APP/$directory" "$executable" "$@"
}

preflight() {
    [[ $EUID == 0 ]] || die 'Exécuter avec sudo ou root.'
    [[ -r /etc/os-release ]] || die '/etc/os-release manquant.'
    # This is a trusted, root-owned OS file, never an application .env.
    . /etc/os-release
    [[ $ID == debian && $VERSION_ID == 13 ]] || die 'Debian 13 requis.'
    local cmd
    for cmd in nginx systemctl systemd-analyze runuser useradd usermod id cut head getent install flock openssl sha256sum stat awk grep sed find readlink ss ip tar mktemp tee cp mv cmp; do
        command_exists "$cmd" || die "Commande bootstrap manquante : $cmd"
    done
    systemctl is-active --quiet nginx || die 'Nginx inactif.'
    nginx -t || die 'Nginx est déjà invalide avant déploiement.'
    if [[ -n $PHP_VERSION ]]; then
        command_exists "php$PHP_VERSION" && command_exists "php-fpm$PHP_VERSION" || die "PHP $PHP_VERSION indisponible. Exécuter le bootstrap séparément."
        [[ $("php$PHP_VERSION" -r 'echo PHP_MAJOR_VERSION,".",PHP_MINOR_VERSION;') == "$PHP_VERSION" ]] || die 'Version PHP incorrecte.'
        systemctl is-active --quiet "php$PHP_VERSION-fpm" || die 'PHP-FPM inactif.'
        "php-fpm$PHP_VERSION" -t || die 'PHP-FPM déjà invalide.'
    fi
    if [[ -n $NODE_MAJOR ]]; then
        [[ -r /opt/nvm/nvm.sh && -x /opt/nvm/node-$NODE_MAJOR/node ]] || die "Node $NODE_MAJOR absent de /opt/nvm. Aucune installation automatique."
        NODE_BIN=$(readlink -f "/opt/nvm/node-$NODE_MAJOR")
        [[ $NODE_BIN == /opt/nvm/versions/node/v*/bin && $(stat -c %u "$NODE_BIN") == 0 ]] || die 'Chemin NVM partagé non conforme.'
        [[ $("$NODE_BIN/node" --version) == v$NODE_MAJOR.* ]] || die 'Version Node incorrecte.'
        [[ -x $NODE_BIN/npm ]] || die 'npm manquant.'
        env "PATH=$NODE_BIN:/usr/local/bin:/usr/bin:/bin" "$NODE_BIN/npm" --version || die 'npm installé mais inexécutable.'
    fi
    if [[ $TYPE == laravel* ]]; then command_exists composer || die 'Composer manquant.'; fi
    if [[ $DATABASE == mariadb ]]; then
        command_exists mariadb || die 'MariaDB manquant.'
        mariadb --protocol=socket --batch --skip-column-names -e 'SELECT 1' >/dev/null || die 'MariaDB root via socket requis.'
    elif [[ $DATABASE == postgresql ]]; then
        command_exists psql || die 'PostgreSQL manquant.'
        runuser -u postgres -- psql -XAt -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null || die 'PostgreSQL peer requis.'
    fi
    if [[ $REDIS_ENABLED == 1 ]]; then command_exists redis-server && command_exists redis-cli || die 'Binaires Redis manquants.'; fi
    if [[ $HTTPS == 1 ]]; then command_exists certbot && command_exists dig || die 'Certbot ou dig manquant.'; fi
    if [[ $SOURCE == git ]]; then command_exists git || die 'Git manquant.'; fi
    if [[ $SOURCE == official ]]; then
        command_exists curl || die 'curl manquant pour le téléchargement officiel.'
        case $OFFICIAL_KIND in prestashop) command_exists unzip || die 'unzip manquant pour PrestaShop.' ;; composer) command_exists composer || die 'Composer requis pour Drupal.' ;; esac
    fi
    if [[ $SSH_ENABLED == 1 || -e /etc/ssh/sshd_config.d/10-vps-project-$PROJECT.conf || -L /etc/ssh/sshd_config.d/10-vps-project-$PROJECT.conf || -e $STATE/password-set || -e $PROJECT_HOME/.ssh/authorized_keys || -L $PROJECT_HOME/.ssh/authorized_keys ]]; then command_exists sshd && command_exists ssh-keygen || die 'OpenSSH manquant.'; fi
    command_exists logrotate || die 'logrotate absent du socle serveur.'


    command_exists curl || die 'curl requis pour le contrôle readiness.'
    command_exists pg_dump || die 'pg_dump requis pour les sauvegardes PostgreSQL.'

    command_exists apt-get || die 'apt-get requis pour les dépendances des navigateurs Debian 13.'
    log 'Préflight système OK ; disponibilité effective des runtimes vérifiée.'
}

setup_state() {
    install -d -m 0700 /var/lib/vps-projects
    exec 9>/var/lib/vps-projects/deploy.lock
    flock -n 9 || die 'Un autre déploiement est en cours.'
    [[ ! -L $STATE ]] || die 'État root lié interdit.'
    install -d -m 0700 "$STATE" "$STATE/files" "$BACKUP"
    if [[ -f $STATE/identity ]]; then
        [[ $(cat "$STATE/identity") == "$IDENTITY" ]] || die 'Type/runtime/layout/DB modifié : utiliser un nouveau nom ou effectuer une migration manuelle.'
    else
        ! getent passwd "$PROJECT" >/dev/null || die 'Utilisateur préexistant non géré ; refus de l’adopter.'
        [[ ! -e $PROJECT_HOME ]] || die 'Home préexistant non géré.'
        printf '%s\n' "$IDENTITY" > "$STATE/identity"
    fi
    TMP=$(mktemp -d /var/lib/vps-projects/.tmp-XXXXXXXX)
    install -d -m 0750 /var/log/vps-projects
    safe_file "$LOG"
    touch "$LOG"; chmod 0600 "$LOG"
    exec > >(tee -a "$LOG") 2>&1
}
setup_user() {
    local shell=/usr/sbin/nologin entry
    # Stay fail-closed until the confined login shell has passed its real probe.
    if ! getent passwd "$PROJECT" >/dev/null; then
        useradd --system --user-group --create-home --home-dir "$PROJECT_HOME" --shell "$shell" "$PROJECT"
    fi
    entry=$(getent passwd "$PROJECT")
    [[ $(cut -d: -f6 <<< "$entry") == "$PROJECT_HOME" && $(id -u "$PROJECT") != 0 ]] || die 'Compte projet non conforme.'
    [[ $(id -Gn "$PROJECT") == "$PROJECT" ]] || die 'Groupes supplémentaires du projet : audit manuel requis.'
    [[ -d $PROJECT_HOME && ! -L $PROJECT_HOME && $(stat -c %u "$PROJECT_HOME") == "$(id -u "$PROJECT")" ]] || die 'Home projet absent, lié ou de propriétaire incorrect.'
    # Repair traversal on reruns too, using the project UID inside its own home.
    as_project chmod 0711 "$PROJECT_HOME"
    set_project_login_shell "$shell"
    for entry in "$PROJECT_HOME" "$SHARED" "$PROJECT_HOME/logs" "$PROJECT_HOME/backups"; do
        [[ ! -L $entry ]] || die "Lien de dossier interdit : $entry"
    done
    # All operations inside the user's writable home run with its UID, including group changes.
    as_project mkdir -p "$SHARED" "$PROJECT_HOME/logs" "$PROJECT_HOME/backups"
    as_project chmod 0750 "$SHARED" "$PROJECT_HOME/logs" "$PROJECT_HOME/backups"
    as_project "$NODE_BIN/node" --version || die 'Node inaccessible au compte applicatif.'
    as_project "$NODE_BIN/npm" --version || die 'npm inaccessible au compte applicatif.'
    log "Node/npm exécutables sous $PROJECT ; PATH applicatif : $NODE_BIN."
    setup_project_shell
    if [[ $LAYOUT == releases ]]; then
        [[ ! -L $PROJECT_HOME/releases ]] || die 'Lien releases interdit.'
        nginx_directory "$PROJECT_HOME/releases"
        if [[ ! -e $APP && ! -L $APP ]]; then
            nginx_directory "$PROJECT_HOME/releases/initial"
            as_project ln -s "$PROJECT_HOME/releases/initial" "$APP"
        fi
        [[ -L $APP && $(readlink -f "$APP") == "$PROJECT_HOME/releases/"* ]] || die 'current doit pointer dans les releases du projet.'
    else
        [[ ! -L $APP ]] || die 'Lien app interdit.'
        nginx_directory "$APP"
    fi
}
nginx_directory() {
    # A fixed command with the project UID and temporary www-data group; no project code or root chown.
    runuser -u "$PROJECT" -g www-data -- /usr/bin/mkdir -p -- "$1"
    runuser -u "$PROJECT" -g www-data -- /usr/bin/chgrp www-data -- "$1"
    as_project chmod 0750 "$1"
}

prepare_source() {
    if [[ $SOURCE == git ]]; then
        if [[ -z $(as_project find "$APP" -mindepth 1 -maxdepth 1 -print -quit) ]]; then
            as_project git clone --branch "$BRANCH" --single-branch -- "$REPOSITORY" "$APP"
        else
            as_project test -d "$APP/.git" || die 'Dossier non vide sans dépôt Git ; aucune écriture.'
            [[ $(app_command git remote get-url origin) == "$REPOSITORY" ]] || die 'Remote Git différent.'
            [[ $(app_command git branch --show-current) == "$BRANCH" ]] || die 'Branche Git différente.'
            log 'Dépôt existant conservé. Les mises à jour Git sont manuelles.'
        fi
    elif [[ $SOURCE == archive ]]; then
        [[ -f $ARCHIVE && ! -L $ARCHIVE ]] || die 'Archive VPS absente ou liée.'
        if [[ ! -f $STATE/archive-imported ]]; then
            [[ -z $(as_project find "$APP" -mindepth 1 -maxdepth 1 -print -quit) ]] || die 'Import archive refusé dans un dossier non vide.'
            install -m 0644 "$ARCHIVE" "$TMP/source.tar.gz"
            tar -tzf "$TMP/source.tar.gz" > "$TMP/archive-list"
            if grep -Ev '^(\./)?[A-Za-z0-9_.@+/-]+/?$' "$TMP/archive-list" || grep -E '(^/|(^|/)\.\.(/|$))' "$TMP/archive-list"; then die 'Chemin dangereux dans l’archive.'; fi
            tar -tvzf "$TMP/source.tar.gz" > "$TMP/archive-types"
            if grep -Ev '^[-d]' "$TMP/archive-types"; then die 'Liens et fichiers spéciaux interdits dans l’archive.'; fi
            chmod 0755 "$TMP"
            as_project tar --extract --gzip --file "$TMP/source.tar.gz" --directory "$APP" --no-same-owner --no-same-permissions
            chmod 0700 "$TMP"
            touch "$STATE/archive-imported"
        else log 'Archive déjà importée ; sources conservées.'; fi
    elif [[ $SOURCE == official ]]; then
        official_source
    fi
    [[ -n $(as_project find "$APP" -mindepth 1 -maxdepth 1 -print -quit) ]] || die "Sources absentes : placer le projet réel dans $APP, puis relancer."
}

setup_env() {
    app_command mkdir -p "$(dirname "$ENV_NAME")"
    as_project test ! -L "$APP/$ENV_NAME" || die '.env lié interdit.'
    as_project test ! -L "$APP/$ENV_EXAMPLE" || die '.env.example lié interdit.'
    if as_project test -e "$APP/$ENV_NAME"; then
        as_project test -f "$APP/$ENV_NAME" || die '.env non régulier.'
        local env_backup
        env_backup="$PROJECT_HOME/backups/env-$(date -u +%Y%m%dT%H%M%SZ)-$$"
        app_command cp -p -- "$ENV_NAME" "$env_backup"
        as_project chmod 0600 "$env_backup"
        ENV_NEW=0
    else
        if as_project test -f "$APP/$ENV_EXAMPLE"; then app_command cp -- "$ENV_EXAMPLE" "$ENV_NAME"; else app_command touch "$ENV_NAME"; fi
        ENV_NEW=1
    fi
    app_command chmod 0600 "$ENV_NAME"
}
env_value() {
    as_project awk -v key="$1" 'index($0,key"=")==1 {v=substr($0,length(key)+2); if(v ~ /^".*"$/ || v ~ /^\047.*\047$/) v=substr(v,2,length(v)-2); print v; exit}' "$APP/$ENV_NAME"
}
env_require() {
    local key=$1 expected=$2
    if [[ $ENV_NEW == 0 ]] && app_command grep -q "^$key=" "$ENV_NAME"; then
        [[ $(env_value "$key") == "$expected" ]] || die "Variable $key existante incompatible. Adapter explicitement .env ou retirer cette clé pour permettre son initialisation. Aucune valeur remplacée."
    fi
}
env_set() {
    # Never source .env. Values travel via stdin to an unprivileged writer.
    local key=$1 value=$2
    if [[ $ENV_NEW == 0 ]] && app_command grep -q "^$key=" "$ENV_NAME"; then return 0; fi
    printf '%s\n' "$value" | as_project /bin/bash -c '
        set -euo pipefail; cd -- "$1"; key=$2; env_name=$3; IFS= read -r value
        tmp=$(mktemp "$env_name.vps.XXXXXX"); chmod 600 "$tmp"
        awk -v k="$key" "index(\$0,k\"=\")!=1" "$env_name" > "$tmp"
        printf "%s=%s\n" "$key" "$value" >> "$tmp"
        mv -f -- "$tmp" "$env_name"
    ' -- "$APP" "$key" "$ENV_NAME"
}

port_free() { ! ss -H -ltn "sport = :$1" | grep -q .; }
port_reserved_elsewhere() {
    local port=$1 own_file=$2 record reserved
    PORT_RESERVATION_FILE=''
    # Provisioned projects reserve their ports even before a service starts listening.
    for record in "${STATE%/*}"/*/*-port; do
        [[ -e $record || -L $record ]] || continue
        [[ $record != "$own_file" ]] || continue
        safe_file "$record"
        [[ $(stat -c %u "$record") == 0 ]] || die "Registre de port non root : $record"
        reserved=$(cat "$record")
        [[ $reserved =~ ^[1-9][0-9]{3,4}$ && $reserved -ge 1024 && $reserved -le 65535 ]] || die "Port réservé invalide : $record"
        if [[ $reserved == "$port" ]]; then
            PORT_RESERVATION_FILE=$record
            return 0
        fi
    done
    return 1
}
select_port() {
    local file=$1 base=$2 end=$3 requested=$4 mode=$5 saved p
    safe_file "$file"
    if [[ -f $file ]]; then
        saved=$(cat "$file")
        [[ $saved =~ ^[1-9][0-9]{3,4}$ && $saved -ge 1024 && $saved -le 65535 ]] || die 'Port enregistré invalide.'
        [[ $mode != manual || $requested == "$saved" ]] || die 'Port modifié : migration manuelle nécessaire.'
        if port_reserved_elsewhere "$saved" "$file"; then
            die "Port enregistré $saved déjà réservé par $PORT_RESERVATION_FILE ; migration manuelle nécessaire."
        fi
        if [[ $file == "$STATE/app-port" && $mode == auto && " ${DECLARED_PORTS[*]} " == *" $saved "* ]]; then
            die "Port automatique enregistré $saved utilisé par un autre processus déclaré ; migration manuelle nécessaire."
        fi
        if ! port_free "$saved"; then
            # The main checks that an occupied saved port actually belongs to our unit.
            local unit=$PROJECT
            [[ $SUPERVISOR != pm2 || $base == 16379 ]] || unit="$PROJECT-pm2"
            [[ $base != 16379 ]] || unit="$PROJECT-redis"
            [[ $TYPE != laravel-react || $base == 16379 || $SUPERVISOR == pm2 ]] || unit="$PROJECT-frontend"
            [[ -z ${6:-} ]] || unit=$6
            systemctl is-active --quiet "$unit" || die "Port enregistré $saved utilisé hors du service projet."
            local pid cgroup
            pid=$(ss -H -ltnp "sport = :$saved" | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -n1)
            [[ -n $pid && -r /proc/$pid/cgroup ]] || die 'Propriétaire du port indéterminé.'
            cgroup=$(cat "/proc/$pid/cgroup")
            [[ $cgroup == *"/$unit.service"* ]] || die "Collision de port $saved."
        fi
        SELECTED_PORT=$saved; return
    fi
    if [[ $mode == manual ]]; then
        if port_reserved_elsewhere "$requested" "$file"; then die "Port $requested déjà réservé par $PORT_RESERVATION_FILE."; fi
        port_free "$requested" || die "Port $requested occupé."
        p=$requested
    else
        p=$base
        while ! port_free "$p" || port_reserved_elsewhere "$p" "$file" || [[ " ${DECLARED_PORTS[*]} " == *" $p "* ]]; do ((p+=1)); [[ $p -le $end ]] || die 'Aucun port libre.'; done
    fi
    printf '%s\n' "$p" > "$file"
    SELECTED_PORT=$p
    log "Port local réservé : $SELECTED_PORT"
}

node_build() {
    as_project test -f "$APP/package.json" || die 'package.json absent.'
    local pm=$PM_REQUEST locks=0
    if [[ $pm == auto ]]; then
        pm=npm
        if as_project test -f "$APP/package-lock.json"; then ((locks+=1)); pm=npm; fi
        if as_project test -f "$APP/pnpm-lock.yaml"; then ((locks+=1)); pm=pnpm; fi
        if as_project test -f "$APP/yarn.lock"; then ((locks+=1)); pm=yarn; fi
        [[ $locks -le 1 ]] || die 'Plusieurs lockfiles : sélectionner explicitement un gestionnaire et nettoyer le projet.'
    fi

    if [[ $pm == npm ]]; then
        if as_project test -f "$APP/package-lock.json"; then
            check_native_dependencies lock
            node_command "$NODE_BIN/npm" ci --include=dev --include=optional
            check_native_dependencies load
        else node_command "$NODE_BIN/npm" install --include=dev --include=optional; fi
        prepare_node_build
        install_browsers
        if [[ $TYPE == nextjs || $TYPE == laravel-react ]] || node_command -e 'process.exit(require("./package.json").scripts?.build ? 0 : 1)'; then node_command "$NODE_BIN/npm" run build; fi
    else
        [[ -x $NODE_BIN/corepack ]] || die 'Corepack absent du bootstrap ; utiliser npm ou préparer le gestionnaire séparément.'
        # No global corepack enable/write into the shared, root-owned NVM tree.
        if [[ $pm == pnpm ]]; then
            if as_project test -f "$APP/pnpm-lock.yaml"; then node_command "$NODE_BIN/corepack" pnpm install --frozen-lockfile --prod=false; else node_command "$NODE_BIN/corepack" pnpm install --prod=false; fi
        else
            local yarn_major
            yarn_major=$(node_command "$NODE_BIN/corepack" yarn --version); yarn_major=${yarn_major%%.*}
            if as_project test -f "$APP/yarn.lock"; then
                if [[ $yarn_major == 1 ]]; then node_command "$NODE_BIN/corepack" yarn install --frozen-lockfile --production=false; else node_command "$NODE_BIN/corepack" yarn install --immutable; fi
            else node_command "$NODE_BIN/corepack" yarn install; fi
        fi
        prepare_node_build
        install_browsers
        if [[ $TYPE == nextjs || $TYPE == laravel-react ]] || node_command -e 'process.exit(require("./package.json").scripts?.build ? 0 : 1)'; then node_command "$NODE_BIN/corepack" "$pm" run build; fi
    fi
    log "Build terminé avec $pm et $NODE_BIN/node."
}
check_native_dependencies() {
    # stdin script, cwd root of the monorepo; project code always runs as its UID.
    node_command - "$1" <<'NATIVE_DEPENDENCIES'

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
if (![2, 3].includes(lock.lockfileVersion) || !lock.packages) {
  throw new Error('package-lock.json v2/v3 requis pour vérifier les dépendances natives. Régénérer et relire le lockfile dans les sources.');
}
const packages = lock.packages;
const findDependency = (parent, name) => {
  let directory = parent;
  while (true) {
    const key = (directory ? directory + '/' : '') + 'node_modules/' + name;
    if (packages[key]) return packages[key];
    if (!directory) return undefined;
    directory = path.posix.dirname(directory);
    if (directory === '.') directory = '';
  }
};
let checked = 0;
for (const [location, entry] of Object.entries(packages)) {
  if (!/(^|\/)node_modules\/(lightningcss|next|@tailwindcss\/oxide)$/.test(location)) continue;
  if (/(^|\/)node_modules\/lightningcss$/.test(location) && !entry.optionalDependencies?.['lightningcss-linux-x64-gnu']) {
    throw new Error('Lockfile natif incomplet : métadonnées lightningcss-linux-x64-gnu absentes dans ' + location);
  }
  for (const [name, version] of Object.entries(entry.optionalDependencies || {})) {
    if (!/^(lightningcss-|@next\/swc-|@tailwindcss\/oxide-)/.test(name)) continue;
    // Keep all platforms in the source lockfile, not just this VPS's platform.
    const binary = findDependency(location, name);
    if (!binary || ( /^\d+\.\d+\.\d+$/.test(version) && binary.version !== version)) {
      throw new Error('Lockfile natif incomplet/incompatible : ' + name + ' demandé par ' + location + '. Réparer le lockfile dans une copie propre des sources, sans node_modules, puis redéployer. --include=optional ne recrée pas une entrée absente.');
    }
  }
  if (/(^|\/)node_modules\/lightningcss$/.test(location)) {
    checked++;
    if (process.argv[2] === 'load') {
      const localRequire = createRequire(path.resolve(location, 'package.json'));
      const css = localRequire(path.resolve(location));
      css.transform({ filename: 'smoke.css', code: Buffer.from('a { color: red; }'), minify: true });
    }
  }
}
console.log('Lockfile natif OK ; Lightning CSS : ' + checked + ' occurrence(s)' + (process.argv[2] === 'load' ? ', chargement et transformation OK' : ''));
NATIVE_DEPENDENCIES
}


setup_project_shell() {
    # Profiles are user data: never read/execute/write them with the root UID.
    as_project /bin/bash -s -- "$NODE_BIN" <<'PROJECT_SHELL' || return $?
set -Eeuo pipefail
umask 077
node_bin=$1
environment="$HOME/.vps-project-env"
safe_profile() {
    [[ ! -L $1 && ( ! -e $1 || -f $1 ) ]] || { printf 'Profil non regulier ou lie : %s\n' "$1" >&2; exit 1; }
}
safe_profile "$environment"
candidate=$(mktemp "$HOME/.vps-shell-XXXXXXXX")
trap 'rm -f -- "$candidate"' EXIT
{
    printf '# Environnement du compte projet, gere par VPS Project Generator.\n'
    printf 'export PM2_HOME=%q\n' "$HOME/.pm2"
    # Prepend Node first, then the local binaries, as in the systemd service.
    for directory in "$node_bin" "$HOME/.local/bin"; do
        [[ -n $directory ]] || continue
        printf 'case ":${PATH-}:" in *:%q:*) ;; *) export PATH=%q:"${PATH-}" ;; esac\n' "$directory" "$directory"
    done
} > "$candidate"
chmod 0600 "$candidate"
mv -f -- "$candidate" "$environment"
for profile in "$HOME/.bashrc" "$HOME/.profile" "$HOME/.bash_profile" "$HOME/.bash_login"; do
    safe_profile "$profile"
    # Bash selects the first existing login profile; preserve that choice.
    case $profile in *.bash_profile|*.bash_login) [[ -e $profile ]] || continue ;; esac
    if [[ -f $profile ]] && grep -Fxq '# VPS Project Generator shell environment v1' "$profile"; then continue; fi
    candidate=$(mktemp "$HOME/.vps-shell-XXXXXXXX")
    {
        # Before Debian's non-interactive .bashrc return, for ssh user command.
        printf '%s\n' '# VPS Project Generator shell environment v1' '[ ! -r "$HOME/.vps-project-env" ] || . "$HOME/.vps-project-env"'
        if [[ -f $profile ]]; then cat -- "$profile"; fi
    } > "$candidate"
    if [[ -f $profile ]]; then chmod --reference="$profile" "$candidate"; else chmod 0644 "$candidate"; fi
    mv -f -- "$candidate" "$profile"
done
PROJECT_SHELL
    log "Environnement SSH de $PROJECT prepare : ~/.local/bin, runtime Node du projet et PM2_HOME prive. Reconnecter les sessions ouvertes."
}


setup_project_admin() {
    :
}
setup_project_mail() {
    :
}
configure_deployment_env() {
    env_set NODE_ENV production
    local db_secret database_url
    db_secret=$(cat "$STATE/db-password")
    database_url="postgresql://$DB_NAME:$db_secret@127.0.0.1:5432/$DB_NAME"
    env_require DATABASE_URL "$database_url"
    env_set DATABASE_URL "$database_url"
    unset db_secret database_url
    env_set 'BETTER_AUTH_URL' 'https://seo.404notfood.fr'
    env_set 'NEXT_PUBLIC_APP_URL' 'https://seo.404notfood.fr'
    env_set 'NEXT_PUBLIC_API_URL' 'https://seo.404notfood.fr'
    env_require 'API_HOST' '127.0.0.1'; env_set 'API_HOST' '127.0.0.1'
    env_require 'API_PORT' '4000'; env_set 'API_PORT' '4000'
    env_require 'BACKUP_DIR' '/home/seo/backups/postgresql'; env_set 'BACKUP_DIR' '/home/seo/backups/postgresql'
    env_require 'GOOGLE_REDIRECT_URI' 'https://seo.404notfood.fr/api/google/callback'; env_set 'GOOGLE_REDIRECT_URI' 'https://seo.404notfood.fr/api/google/callback'
    if [[ -z $(env_value 'BETTER_AUTH_SECRET') || $ENV_NEW == 1 ]]; then env_set 'BETTER_AUTH_SECRET' "$(openssl rand -base64 48 | tr -d '\n')"; fi
    if [[ -z $(env_value 'BACKUP_ENCRYPTION_KEY') || $ENV_NEW == 1 ]]; then env_set 'BACKUP_ENCRYPTION_KEY' "$(openssl rand -hex 32)"; fi
    if [[ -z $(env_value 'CMS_CREDENTIAL_KEY') || $ENV_NEW == 1 ]]; then env_set 'CMS_CREDENTIAL_KEY' "$(openssl rand -hex 32)"; fi
    env_set BACKUP_DIR "$PROJECT_HOME/backups/postgresql"
    as_project mkdir -p "$(env_value BACKUP_DIR)"
    as_project chmod 0700 "$(env_value BACKUP_DIR)"
    env_set PLAYWRIGHT_BROWSERS_PATH "$PROJECT_HOME/.cache/ms-playwright"
    env_set PUPPETEER_CACHE_DIR "$PROJECT_HOME/.cache/puppeteer"
}
validate_project_env() {
    node_command -e 'const keys=JSON.parse(process.argv[1]); for(const key of keys) { const value=process.env[key]; if(!value || /TODO_FILL|changeme|USER:PASSWORD|<openssl|\.\.\./i.test(value)) { console.error("Variable de production à remplir : " + key); process.exitCode=1; } }' '["DATABASE_URL","BETTER_AUTH_SECRET","BETTER_AUTH_URL","NEXT_PUBLIC_APP_URL","NEXT_PUBLIC_API_URL","REDIS_HOST","REDIS_PORT","REDIS_PASSWORD","CMS_CREDENTIAL_KEY","BACKUP_ENCRYPTION_KEY","BACKUP_DIR"]' || die "Compléter $APP/$ENV_NAME puis relancer. Aucun secret remplacé."
}
prepare_node_build() {
    PRISMA_BIN="$APP/site/node_modules/prisma/build/index.js"
    if ! as_project test -f "$PRISMA_BIN"; then PRISMA_BIN="$APP/node_modules/prisma/build/index.js"; fi
    as_project test -f "$PRISMA_BIN" || die 'CLI Prisma local absent.'
    project_exec 'site' node "$PRISMA_BIN" generate
    project_exec '.' 'node' 'deployment/preflight.mjs' '--config-only'
    if [[ $pm == npm ]]; then node_command "$NODE_BIN/npm" run 'typecheck'; else node_command "$NODE_BIN/corepack" "$pm" run 'typecheck'; fi
    if [[ $pm == npm ]]; then node_command "$NODE_BIN/npm" run 'test'; else node_command "$NODE_BIN/corepack" "$pm" run 'test'; fi
    if [[ $pm == npm ]]; then node_command "$NODE_BIN/npm" run 'lint'; else node_command "$NODE_BIN/corepack" "$pm" run 'lint'; fi
}
setup_browser_dependencies() {
    # Fixed Debian 13 packages only. Never run a project's install-deps script as root.
    apt-get update
    apt-get install -y --no-install-recommends ca-certificates fonts-liberation fonts-noto-color-emoji fonts-unifont fonts-ipafont-gothic fonts-wqy-zenhei fonts-tlwg-loma-otf fonts-freefont-ttf xfonts-scalable libfontconfig1 libfreetype6 libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 libxrender1 libxss1 libxshmfence1 libgtk-3-0t64
}
install_browsers() {
    as_project test -f "$APP/node_modules/playwright/cli.js" || die 'Playwright doit être installé dans le projet.'
    node_command "$APP/node_modules/playwright/cli.js" install chromium
    node_command --input-type=module <<'PLAYWRIGHT_CHECK'
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, chromiumSandbox: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--disable-dev-shm-usage'] });
try { console.log('Playwright sandbox : OK'); } finally { await browser.close(); }
PLAYWRIGHT_CHECK
    node_command "$NODE_BIN/npm" exec --offline -- puppeteer browsers install chrome
    node_command --input-type=module <<'PUPPETEER_CHECK'
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, args: ['--disable-dev-shm-usage'] });
try { const page = await browser.newPage(); await page.setContent('<h1>PDF</h1>'); const pdf = Buffer.from(await page.pdf()); if(pdf.subarray(0,5).toString() !== '%PDF-') throw new Error('PDF invalide'); console.log('Puppeteer PDF : OK'); } finally { await browser.close(); }
PUPPETEER_CHECK
}
finish_deployment() {

    run_backup

    project_exec 'site' node "$PRISMA_BIN" migrate deploy

}
run_backup() {
    as_project "$NODE_BIN/node" "--env-file=$APP/$ENV_NAME" "/etc/vps-projects/$PROJECT/operations.mjs" backup
}
setup_operations() {
    managed_write "/etc/logrotate.d/vps-project-$PROJECT" <<LOGROTATE
/var/log/vps-projects/$PROJECT.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    su root root
}
$PROJECT_HOME/logs/*.log $APP/logs/*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    su $PROJECT $PROJECT
}
LOGROTATE
    managed_write "/etc/vps-projects/$PROJECT/operations.mjs" 0640 "$PROJECT" <<OPERATIONS_CONFIG
const CONFIG = { ...JSON.parse(Buffer.from("7b2270726f6a656374223a2273656f222c22617070223a222f686f6d652f73656f2f617070222c22656e7646696c65223a222f686f6d652f73656f2f6170702f2e656e762e70726f64756374696f6e222c226261636b7570436f6d6d616e64223a5b226e6f6465222c226465706c6f796d656e742f6261636b75702e6d6a73222c22637265617465225d2c226d6f6e69746f72436f6d6d616e64223a5b226e6f6465222c226465706c6f796d656e742f6d6f6e69746f722e6d6a73222c222d2d7175696574225d2c2272656d6f7465223a22222c22726574656e74696f6e223a31342c226261636b7570456e61626c6564223a747275652c22726561647950617468223a222f6865616c74682f7265616479222c227265616479506f7274223a343030302c2270726f636573734e616d6573223a5b2234303473656f2d73697465222c2234303473656f2d617069222c2234303473656f2d776f726b6572222c2234303473656f2d7363686564756c6572222c2234303473656f2d636d732d776f726b6572225d7d", 'hex').toString('utf8')), node: "$NODE_BIN/node", npm: "$NODE_BIN/npm", php: "/usr/bin/php$PHP_VERSION", pm2: "$PROJECT_HOME/.local/lib/node_modules/pm2/bin/pm2" };

import { createCipheriv, randomBytes, createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, appendFile, readdir, stat, lstat, realpath, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn, execFileSync } from 'node:child_process';
import { join, resolve, relative, basename, isAbsolute } from 'node:path';
const inside = (base, path) => { const p = relative(base, path); return !p || !p.startsWith('..') && !isAbsolute(p); };
const run = (binary, args, options = {}) => new Promise((accept, reject) => {
  const child = spawn(binary, args, { ...options, stdio: ['ignore', 'ignore', 'ignore'] });
  child.on('error', () => reject(new Error('Commande indisponible')));
  child.on('close', code => code === 0 ? accept() : reject(new Error('Commande échouée')));
});
async function digest(file) { const hash = createHash('sha256'); for await (const part of createReadStream(file)) hash.update(part); return hash.digest('hex'); }
async function encrypt(stream, file, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const magic = Buffer.from('SEO404B1'); cipher.setAAD(magic);
  await writeFile(file, Buffer.concat([magic, iv]), { flag: 'wx', mode: 0o600 });
  await pipeline(stream, cipher, createWriteStream(file, { flags: 'a', mode: 0o600 }));
  await appendFile(file, cipher.getAuthTag());
}
async function archiveDirectory() {
  const value = process.env.BACKUP_DIR;
  if (!value || !isAbsolute(value)) throw new Error('BACKUP_DIR absolu requis');
  await mkdir(value, { recursive: true, mode: 0o700 });
  const dir = await realpath(value), repo = await realpath(CONFIG.app);
  if (inside(repo, dir) || inside(dir, repo) || /\/(?:public_html|public_shtml)(?:\/|\$)/.test(dir) || (await stat(dir)).mode & 0o077) throw new Error('BACKUP_DIR doit être privé et hors du dépôt');
  return dir;
}
async function validArchives(dir) {
  const results = [];
  for (const name of await readdir(dir)) {
    if (!/^\d{4}-\d{2}-\d{2}T[0-9Z-]+-[a-f0-9]{8}\$/.test(name)) continue;
    const folder = join(dir, name);
    try {
      if (!(await lstat(folder)).isDirectory()) continue;
      const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
      if (manifest.version !== 1 || !manifest.files || !Number.isFinite(Date.parse(manifest.createdAt))) continue;
      for (const file of ['database.dump.enc', 'configuration.env.enc']) {
        const entry = manifest.files[file], info = await lstat(join(folder, file));
        if (!entry || !info.isFile() || entry.bytes !== info.size || info.size <= 36 || entry.sha256 !== await digest(join(folder, file))) throw new Error('Archive invalide');
      }
      results.push({ folder, date: Date.parse(manifest.createdAt) });
    } catch { /* Incomplete or unrelated directories are never pruned or transferred. */ }
  }
  return results.sort((a, b) => b.date - a.date);
}
async function createBackup(dir) {
  const value = process.env.BACKUP_ENCRYPTION_KEY;
  if (!/^[a-f0-9]{64}\$/i.test(value || '') || value === process.env.CMS_CREDENTIAL_KEY) throw new Error('Clé de sauvegarde hexadécimale dédiée requise');
  const key = Buffer.from(value, 'hex'), db = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(db.protocol)) throw new Error('PostgreSQL requis');
  const folder = join(dir, new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(4).toString('hex'));
  await mkdir(folder, { mode: 0o700 });
  const env = { ...process.env, PGHOST: db.hostname, PGPORT: db.port || '5432', PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password), PGDATABASE: decodeURIComponent(db.pathname.slice(1)), PGCONNECT_TIMEOUT: '10', PGSSLMODE: db.searchParams.get('sslmode') || 'prefer' };
  const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-acl'], { env, stdio: ['ignore', 'pipe', 'ignore'] });
  const done = new Promise((accept, reject) => { child.on('error', () => reject(new Error('pg_dump indisponible'))); child.on('close', code => code === 0 ? accept() : reject(new Error('pg_dump échoué'))); });
  done.catch(() => {});
  try {
    await Promise.all([encrypt(child.stdout, join(folder, 'database.dump.enc'), key), done]);
    await encrypt(Readable.from([await readFile(CONFIG.envFile)]), join(folder, 'configuration.env.enc'), key);
    const files = {};
    for (const file of ['database.dump.enc', 'configuration.env.enc']) files[file] = { bytes: (await stat(join(folder, file))).size, sha256: await digest(join(folder, file)) };
    await writeFile(join(folder, 'manifest.json'), JSON.stringify({ version: 1, project: CONFIG.project, createdAt: new Date().toISOString(), files }), { flag: 'wx', mode: 0o600 });
  } catch { child.kill(); throw new Error('Sauvegarde incomplète, sans manifeste valide'); }
}
function command(argv) {
  const first = argv[0], args = argv.slice(1);
  if (first === 'npm') return { binary: CONFIG.node, args: [CONFIG.npm, ...args] };
  if (first === 'node') return { binary: CONFIG.node, args };
  if (first === 'php') return { binary: CONFIG.php, args };
  throw new Error('Commande non autorisée');
}
async function backup() {
  const dir = await archiveDirectory(), before = new Set((await validArchives(dir)).map(item => item.folder));
  if (CONFIG.backupCommand.length) { const cmd = command(CONFIG.backupCommand); await run(cmd.binary, cmd.args, { cwd: CONFIG.app }); }
  else await createBackup(dir);
  const archives = await validArchives(dir), fresh = archives.filter(item => !before.has(item.folder));
  if (!fresh.length) throw new Error('Aucune nouvelle archive complète confirmée');
  if (CONFIG.remote) for (const item of fresh) await run('rsync', ['-a', '--checksum', '-e', 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes', '--', item.folder + '/', CONFIG.remote.replace(/\/\$/, '') + '/' + basename(item.folder) + '/']);
  else console.warn('Sauvegarde locale uniquement : copie extérieure à configurer.');
  // Keep the newest archive, and only prune complete archives in this private directory.
  for (const item of archives.slice(1)) if (item.date < Date.now() - CONFIG.retention * 86400000) await rm(item.folder, { recursive: true });
  console.log('Sauvegarde chiffrée vérifiée' + (CONFIG.remote ? ', copie extérieure terminée' : ''));
}
async function monitor() {
  if (CONFIG.readyPath) {
    const response = await fetch('http://127.0.0.1:' + CONFIG.readyPort + CONFIG.readyPath, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Readiness indisponible');
  }
  if (CONFIG.processNames.length) {
    // PM2 JSON contains secrets; never print it or include it in an error.
    let apps;
    try {
      execFileSync('systemctl', ['is-active', '--quiet', CONFIG.project + '-pm2.service'], { timeout: 5000, stdio: 'ignore' });
      apps = JSON.parse(execFileSync(CONFIG.node, [CONFIG.pm2, 'jlist'], { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }));
    }
    catch { throw new Error('État PM2 indisponible'); }
    for (const name of CONFIG.processNames) if (!apps.some(p => p.name === name && p.pm2_env.status === 'online')) throw new Error('Processus PM2 indisponible : ' + name);
  }
  if (CONFIG.backupEnabled) {
    const archives = await validArchives(await archiveDirectory());
    if (!archives.length || archives[0].date < Date.now() - 26 * 3600000) throw new Error('Sauvegarde complète trop ancienne ou absente');
  }
  if (CONFIG.monitorCommand.length) { const cmd = command(CONFIG.monitorCommand); await run(cmd.binary, cmd.args, { cwd: CONFIG.app }); }
}
try {
  if (process.getuid() === 0) throw new Error('Exécution non-root requise');
  if (process.argv[2] === 'backup') await backup();
  else if (process.argv[2] === 'monitor') await monitor();
  else throw new Error('Usage : backup | monitor');
} catch (error) { console.error('Exploitation : ' + error.message); process.exitCode = 1; }
OPERATIONS_CONFIG
    "$NODE_BIN/node" --check "/etc/vps-projects/$PROJECT/operations.mjs"
    managed_write "/etc/systemd/system/$PROJECT-backup.service" <<TASK_UNIT
# Managed by VPS Project Generator : $PROJECT
[Unit]
Description=$PROJECT backup
After=network.target
[Service]
Type=oneshot
User=$PROJECT
Group=$PROJECT
WorkingDirectory=$APP
Environment="HOME=$PROJECT_HOME"
Environment="PATH=$PROJECT_HOME/.local/bin:$NODE_BIN:/usr/local/bin:/usr/bin:/bin"
Environment="PM2_HOME=$PROJECT_HOME/.pm2"
ExecStart=$NODE_BIN/node --env-file=$APP/$ENV_NAME /etc/vps-projects/$PROJECT/operations.mjs backup
UMask=0077
TimeoutStartSec=3600
StandardOutput=journal
StandardError=journal
TASK_UNIT
    managed_write "/etc/systemd/system/$PROJECT-backup.timer" <<TASK_TIMER
# Managed by VPS Project Generator : $PROJECT
[Unit]
Description=$PROJECT backup périodique
[Timer]
OnCalendar=*-*-* 02:15:00
Persistent=true
RandomizedDelaySec=30
Unit=$PROJECT-backup.service
[Install]
WantedBy=timers.target
TASK_TIMER
    systemd-analyze verify "/etc/systemd/system/$PROJECT-backup.service" "/etc/systemd/system/$PROJECT-backup.timer"

    managed_write "/etc/systemd/system/$PROJECT-monitor.service" <<TASK_UNIT
# Managed by VPS Project Generator : $PROJECT
[Unit]
Description=$PROJECT monitor
After=network.target
[Service]
Type=oneshot
User=$PROJECT
Group=$PROJECT
WorkingDirectory=$APP
Environment="HOME=$PROJECT_HOME"
Environment="PATH=$PROJECT_HOME/.local/bin:$NODE_BIN:/usr/local/bin:/usr/bin:/bin"
Environment="PM2_HOME=$PROJECT_HOME/.pm2"
ExecStart=$NODE_BIN/node --env-file=$APP/$ENV_NAME /etc/vps-projects/$PROJECT/operations.mjs monitor
UMask=0077
TimeoutStartSec=90
StandardOutput=journal
StandardError=journal
TASK_UNIT
    managed_write "/etc/systemd/system/$PROJECT-monitor.timer" <<TASK_TIMER
# Managed by VPS Project Generator : $PROJECT
[Unit]
Description=$PROJECT monitor périodique
[Timer]
OnCalendar=*-*-* *:0/5:00
Persistent=true
RandomizedDelaySec=30
Unit=$PROJECT-monitor.service
[Install]
WantedBy=timers.target
TASK_TIMER
    systemd-analyze verify "/etc/systemd/system/$PROJECT-monitor.service" "/etc/systemd/system/$PROJECT-monitor.timer"

}
activate_deployment() {
    activate_pm2
    local attempt
    for attempt in {1..24}; do
        if curl --fail --silent --max-time 5 'http://127.0.0.1:4000/health/ready' >/dev/null; then break; fi
        [[ $attempt -ne 24 ]] || die 'Readiness indisponible après démarrage.'
        sleep 5
    done
    project_exec '.' 'node' 'deployment/preflight.mjs'
    enable_unit "$PROJECT-backup.timer"
    APP_UNITS+=("$PROJECT-backup.timer")
    enable_unit "$PROJECT-monitor.timer"
    APP_UNITS+=("$PROJECT-monitor.timer")
    printf '%s\n' "${APP_UNITS[@]}" | sed '/^$/d' > "$STATE/units"
}


setup_dependency_audit() {
    managed_write "/etc/vps-projects/$PROJECT/dependency-audit.sh" 0750 "$PROJECT" <<'DEPENDENCY_AUDIT'
#!/bin/bash
set -Eeuo pipefail
export PATH="/opt/nvm/node-24:/usr/local/bin:/usr/bin:/bin"
export NPM_CONFIG_CACHE="${TMPDIR:-/tmp}/vps-audit-seo"
export COMPOSER_CACHE_DIR="$NPM_CONFIG_CACHE/composer"
export YARN_CACHE_FOLDER="$NPM_CONFIG_CACHE/yarn"
[[ $(id -un) == 'seo' && $EUID != 0 ]] || exit 126
cd '/home/seo/app'
status=0

if [[ -f package.json ]]; then
    if [[ -f pnpm-lock.yaml ]]; then
        corepack pnpm audit --prod --audit-level high || status=1
    elif [[ -f yarn.lock ]]; then
        version=$(corepack yarn --version)
        if [[ $version == 1.* ]]; then
            # A transport failure can also exit 1: require a real audit summary.
            report=$(mktemp)
            corepack yarn audit --json --groups 'dependencies optionalDependencies' > "$report" 2>&1 || :
            cat "$report"
            node -e 'const fs=require("node:fs"); try { const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(l=>{try{return JSON.parse(l)}catch{return {}}}); const summary=rows.find(r=>r.type==="auditSummary")?.data?.vulnerabilities; if(!summary || rows.some(r=>r.type==="error") || summary.high || summary.critical) process.exit(1); } catch { process.exit(1); }' "$report" || status=1
            rm -f -- "$report"
        else
            corepack yarn npm audit --all --recursive --environment production --severity high || status=1
        fi
    elif [[ -f package-lock.json || -f npm-shrinkwrap.json ]]; then
        npm audit --omit=dev --audit-level=high --ignore-scripts || status=1
    else
        echo 'Lockfile Node absent : audit impossible.' >&2; status=1
    fi
fi
if (( status )); then echo 'Audit de sécurité en échec : consulter le détail, corriger et tester les dépendances avant de redéployer.' >&2; fi
exit "$status"
DEPENDENCY_AUDIT
    managed_write "/etc/systemd/system/$PROJECT-security-audit.service" <<UNIT
# Managed by VPS Project Generator : $PROJECT
[Unit]
Description=$PROJECT audit des dépendances de production
After=network-online.target
[Service]
Type=oneshot
User=$PROJECT
Group=$PROJECT
ExecStart=/etc/vps-projects/$PROJECT/dependency-audit.sh
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
UMask=0077
TimeoutStartSec=600
UNIT
    managed_write "/etc/systemd/system/$PROJECT-security-audit.timer" <<UNIT
# Managed by VPS Project Generator : $PROJECT
[Unit]
Description=$PROJECT audit quotidien des dépendances
[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true
Unit=$PROJECT-security-audit.service
[Install]
WantedBy=timers.target
UNIT
    systemd-analyze verify "/etc/systemd/system/$PROJECT-security-audit.service" "/etc/systemd/system/$PROJECT-security-audit.timer"
}
audit_dependencies() {
    as_project "/etc/vps-projects/$PROJECT/dependency-audit.sh" || die 'Audit dépendances non validé ; migrations et activation refusées. Consulter le journal privé.'
}
activate_security_audit() {
    systemctl daemon-reload
    enable_unit "$PROJECT-security-audit.timer"
}


run_seed() {

    :
}


setup_pm2() {
    as_project mkdir -p "$PROJECT_HOME/.local" "$PROJECT_HOME/.pm2" "$APP/logs"
    as_project chmod 0700 "$PROJECT_HOME/.pm2"
    if ! as_project test -f "$PROJECT_HOME/.local/lib/node_modules/pm2/bin/pm2"; then
        as_project "$NODE_BIN/npm" install --global --prefix "$PROJECT_HOME/.local" --ignore-scripts pm2@6
    fi
    PM2_BIN="$PROJECT_HOME/.local/lib/node_modules/pm2/bin/pm2"
    as_project "$NODE_BIN/node" -e 'console.log(require(process.argv[1]).version)' "$PROJECT_HOME/.local/lib/node_modules/pm2/package.json"
    select_port "$STATE/app-port" 3000 3999 "$REQUESTED_PORT" "$PORT_MODE"
    PORT=$SELECTED_PORT
    select_port "$STATE/404seo-api-port" 4000 4000 4000 manual "$PROJECT-pm2"
    as_project test -f "$APP/deployment/ecosystem.config.cjs" || die 'Ecosystem PM2 absent.'
    node_command -e 'const config=require(process.argv[1]); const names=JSON.parse(process.argv[2]); if(!Array.isArray(config.apps) || config.apps.length!==names.length || new Set(config.apps.map(p=>p.name)).size!==names.length || config.apps.some(p=>!names.includes(p.name) || p.exec_mode!=="fork" || (p.instances??1)!==1 || (p.kill_timeout??0)<120000)) process.exit(1)' "$APP/deployment/ecosystem.config.cjs" '["404seo-site","404seo-api","404seo-worker","404seo-scheduler","404seo-cms-worker"]' || die 'Ecosystem incompatible : noms exacts, fork, une instance et arrêt gracieux 120s requis.'
    PM2_CONFIG="$APP/deployment/ecosystem.config.cjs"
    managed_write "/etc/systemd/system/$PROJECT-pm2.service" <<PM2_UNIT
# Managed by VPS Project Generator : $PROJECT
[Unit]
Description=$PROJECT PM2
After=network.target seo-redis.service
[Service]
Type=forking
User=$PROJECT
Group=$PROJECT
Environment="HOME=$PROJECT_HOME"
Environment="PM2_HOME=$PROJECT_HOME/.pm2"
Environment="PATH=$PROJECT_HOME/.local/bin:$NODE_BIN:/usr/local/bin:/usr/bin:/bin"
PIDFile=$PROJECT_HOME/.pm2/pm2.pid
ExecStart=$NODE_BIN/node $PROJECT_HOME/.local/lib/node_modules/pm2/bin/pm2 resurrect
ExecReload=$NODE_BIN/node $PROJECT_HOME/.local/lib/node_modules/pm2/bin/pm2 reload all
ExecStop=$NODE_BIN/node $PROJECT_HOME/.local/lib/node_modules/pm2/bin/pm2 kill
Restart=on-failure
TimeoutStopSec=180
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$PROJECT_HOME
ProtectProc=invisible
RestrictSUIDSGID=true
LimitNOFILE=65536
TasksMax=2048
[Install]
WantedBy=multi-user.target
PM2_UNIT
    systemd-analyze verify "/etc/systemd/system/$PROJECT-pm2.service"
    if ! as_project test -f "$PROJECT_HOME/.pm2/dump.pm2"; then
        printf '[]\n' | as_project /bin/bash -c 'umask 077; cat > "$1"' -- "$PROJECT_HOME/.pm2/dump.pm2"
    fi
    APP_UNITS+=("$PROJECT-pm2.service")
}
activate_pm2() {
    # Start inside systemd before loading processes, so port ownership follows its cgroup.
    as_project "$NODE_BIN/node" "$PM2_BIN" startOrReload "$PM2_CONFIG" --update-env
    local previous
    if [[ -f $STATE/pm2-names ]]; then
        while IFS= read -r previous; do
            [[ $previous =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$ ]] || die 'Registre des processus PM2 invalide.'
            case "$previous" in
                '404seo-site'|'404seo-api'|'404seo-worker'|'404seo-scheduler'|'404seo-cms-worker') : ;;
                *) as_project "$NODE_BIN/node" "$PM2_BIN" delete "$previous" ;;
            esac
        done < "$STATE/pm2-names"
    fi
    as_project "$NODE_BIN/node" "$PM2_BIN" save
    as_project chmod 0600 "$PROJECT_HOME/.pm2/dump.pm2"
    local endpoint waited
    waited=0
    while port_free "$PORT"; do sleep 1; ((waited+=1)); [[ $waited -le 60 ]] || die 'Processus PM2 sans écoute sur son port déclaré.'; done
    while IFS= read -r endpoint; do [[ $endpoint == "127.0.0.1:$PORT" ]] || die 'Un processus PM2 écoute hors de loopback.'; done < <(ss -H -ltn "sport = :$PORT" | awk '{print $4}')
    waited=0
    while port_free "4000"; do sleep 1; ((waited+=1)); [[ $waited -le 60 ]] || die 'Processus PM2 sans écoute sur son port déclaré.'; done
    while IFS= read -r endpoint; do [[ $endpoint == "127.0.0.1:4000" ]] || die 'Un processus PM2 écoute hors de loopback.'; done < <(ss -H -ltn "sport = :4000" | awk '{print $4}')
    as_project "$NODE_BIN/node" "$PM2_BIN" jlist | as_project "$NODE_BIN/node" -e 'let data=""; process.stdin.on("data",chunk=>data+=chunk); process.stdin.on("end",()=>{try { const apps=JSON.parse(data), names=JSON.parse(process.argv[1]); if(names.some(name=>!apps.some(p=>p.name===name && p.pm2_env.status==="online"))) throw new Error(); } catch { console.error("Processus PM2 absent ou arrêté"); process.exitCode=1; } });' '["404seo-site","404seo-api","404seo-worker","404seo-scheduler","404seo-cms-worker"]' || die 'PM2 incomplet après démarrage.'
    printf '%s\n' '404seo-site' '404seo-api' '404seo-worker' '404seo-scheduler' '404seo-cms-worker' | sed '/^$/d' > "$STATE/pm2-names"
}


setup_database() {
    [[ $DATABASE != none ]] || return 0
    local existing_db existing_user DB_PASSWORD
    if [[ $DATABASE == mariadb ]]; then
        existing_db=$(mariadb --protocol=socket -NBe "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$DB_NAME'")
        existing_user=$(mariadb --protocol=socket -NBe "SELECT COUNT(*) FROM mysql.user WHERE User='$DB_NAME'")
    else
        existing_db=$(runuser -u postgres -- psql -XAt -c "SELECT count(*) FROM pg_database WHERE datname='$DB_NAME'")
        existing_user=$(runuser -u postgres -- psql -XAt -c "SELECT count(*) FROM pg_roles WHERE rolname='$DB_NAME'")
    fi
    if [[ ! -f $STATE/db-claimed ]]; then
        [[ $existing_db == 0 && $existing_user == 0 ]] || die 'Base ou compte DB préexistant non géré ; aucune adoption.'
        touch "$STATE/db-claimed"
    fi
    if [[ ! -f $STATE/db-password ]]; then openssl rand -hex 32 > "$STATE/db-password"; chmod 0600 "$STATE/db-password"; fi
    DB_PASSWORD=$(cat "$STATE/db-password")
    [[ $DB_PASSWORD =~ ^[a-f0-9]{64}$ ]] || die 'Secret DB enregistré invalide.'
    if [[ $DATABASE == mariadb ]]; then
        # SQL uses a restricted identifier and a generated hex secret; stdin, never argv/logs.
        if ! mariadb --protocol=socket > "$TMP/db-create.out" 2> "$TMP/db-create.err" <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_NAME'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_NAME'@'127.0.0.1';
SQL
        then die 'Création MariaDB échouée (diagnostic SQL masqué pour protéger les secrets).'; fi
        # Check credentials without putting the password in argv.
        MYSQL_PWD=$DB_PASSWORD mariadb --host=127.0.0.1 --user="$DB_NAME" "$DB_NAME" -e 'SELECT 1' >/dev/null || die 'Authentification MariaDB échouée. Aucun secret existant remplacé.'
    else
        if [[ $existing_user == 0 ]]; then
            if ! runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 > "$TMP/db-create.out" 2> "$TMP/db-create.err" <<SQL
CREATE ROLE "$DB_NAME" LOGIN PASSWORD '$DB_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;
SQL
            then die 'Création du rôle PostgreSQL échouée (diagnostic SQL masqué pour protéger les secrets).'; fi
        fi
        if [[ $existing_db == 0 ]]; then runuser -u postgres -- createdb --owner="$DB_NAME" "$DB_NAME"; fi
        # Verify an existing DB's owner before allowing schema changes.
        [[ $(runuser -u postgres -- psql -XAt -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='$DB_NAME'") == "$DB_NAME" ]] || die 'Propriétaire PostgreSQL différent.'
        runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" <<SQL
REVOKE ALL ON DATABASE "$DB_NAME" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE "$DB_NAME" TO "$DB_NAME";
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO "$DB_NAME";
SQL
        PGPASSWORD=$DB_PASSWORD psql -X -h 127.0.0.1 -U "$DB_NAME" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null || die 'Authentification PostgreSQL échouée.'
    fi
}

configure_database_env() {
    [[ $DATABASE != none ]] || return 0
    local DB_PASSWORD
    [[ -f $STATE/db-claimed && -f $STATE/db-password ]] || die 'Base non préparée : exécuter le provisionnement avant la configuration .env.'
    DB_PASSWORD=$(cat "$STATE/db-password")
    [[ $DB_PASSWORD =~ ^[a-f0-9]{64}$ ]] || die 'Secret DB enregistré invalide.'
    # Validate every existing key before any write; a retry must retain managed credentials.
    env_require DB_HOST 127.0.0.1
    env_require DB_DATABASE "$DB_NAME"
    env_require DB_USERNAME "$DB_NAME"
    env_require DB_PASSWORD "$DB_PASSWORD"
    if [[ $DATABASE == mariadb ]]; then env_require DB_CONNECTION mysql; env_require DB_PORT 3306
    else env_require DB_CONNECTION pgsql; env_require DB_PORT 5432; fi
    if [[ $DATABASE == mariadb ]]; then env_set DB_CONNECTION mysql; env_set DB_PORT 3306
    else env_set DB_CONNECTION pgsql; env_set DB_PORT 5432; fi
    env_set DB_HOST 127.0.0.1; env_set DB_DATABASE "$DB_NAME"; env_set DB_USERNAME "$DB_NAME"; env_set DB_PASSWORD "$DB_PASSWORD"
}


setup_pgadmin_registration() {
    [[ $DATABASE == postgresql ]] || return 0
    if [[ ! -x /opt/vps-pgadmin/bin/python || ! -f /var/lib/vps-pgadmin/pgadmin4.db ]]; then
        warn 'pgAdmin absent : base PostgreSQL creee ; installer les services admin pour son enregistrement automatique.'
        return 0
    fi
    local pgdir helper status=0
    pgdir=$(/opt/vps-pgadmin/bin/python -c 'import sysconfig; print(sysconfig.get_path("purelib") + "/pgadmin4")')
    [[ -f $pgdir/setup.py ]] || die 'Distribution pgAdmin incompatible.'
    [[ -f $STATE/db-claimed && -f $STATE/db-password ]] || die 'Base PostgreSQL non preparee.'
    helper=$(mktemp -d /run/vps-pgadmin-register-XXXXXX)
    cat > "$helper/register.py" <<'PGADMIN_REGISTER'
from contextlib import closing
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile


def register(pgdir, project, database, password, data=Path('/var/lib/vps-pgadmin')):
    if not re.fullmatch(r'[a-z_][a-z0-9_-]{0,30}', project) or database != project.replace('-', '_'):
        raise ValueError('Nom de projet invalide.')
    if not re.fullmatch(r'[a-f0-9]{64}', password):
        raise ValueError('Secret DB invalide.')
    settings = data / 'pgadmin4.db'
    if settings.is_symlink() or not settings.is_file():
        raise ValueError('Configuration pgAdmin absente ou liee.')
    def inspect():
        with closing(sqlite3.connect(settings.resolve().as_uri() + '?mode=ro', uri=True, timeout=30)) as db:
            db.row_factory = sqlite3.Row
            owners = db.execute('''SELECT u.id,u.email,u.username FROM "user" AS u
                JOIN roles_users AS ru ON ru.user_id=u.id JOIN role AS r ON r.id=ru.role_id
                WHERE u.active=1 AND u.auth_source='internal' AND r.name='Administrator'
                ORDER BY u.id''').fetchall()
            if not owners:
                raise ValueError('Administrateur pgAdmin interne absent.')
            owner = owners[0]
            servers = db.execute('SELECT id,name,host,port,maintenance_db,username,connection_params FROM server WHERE user_id=?', (owner['id'],)).fetchall()
            return owner, servers
    owner, servers = inspect()
    def compatible(server):
        return (server['host'], server['port'], server['maintenance_db'], server['username']) == ('127.0.0.1', 5432, database, database)
    named = [s for s in servers if s['name'] == project]
    matches = named or [s for s in servers if compatible(s)]
    if len(matches) > 1 or any(not compatible(s) for s in matches):
        raise ValueError('Connexion pgAdmin preexistante ambigue ou incompatible ; aucune modification.')
    # Match pgAdmin 9.18's storage username normalization. The password file is
    # relative to this user's storage, never shared with other pgAdmin accounts.
    username = owner['username']
    def storage_name(value):
        if not value or value[0].isdigit():
            value = 'pga_user_' + value
        return value.replace('@', '_').replace('/', 'slash').replace(chr(92), 'slash')
    if storage_name(username) in ('.', '..') or data.is_symlink():
        raise ValueError('Stockage pgAdmin incompatible.')
    storage = data / 'storage'
    directory = storage / storage_name(username)
    old_directory = storage / storage_name(username.split('@')[0])
    for path in (storage, directory, old_directory):
        if path.is_symlink() or (path.exists() and not path.is_dir()):
            raise ValueError('Stockage pgAdmin incompatible.')
    filename = 'vps-project-' + project + '.pgpass'
    if matches:
        params = json.loads(matches[0]['connection_params'] or '{}')
        if params.get('passfile') != filename:
            # A compatible manual registration is already visible. Preserve its
            # saved password and preferences instead of duplicating/replacing it.
            return owner['email'], 'connexion existante conservee'
    storage.mkdir(mode=0o700, exist_ok=True)
    if old_directory != directory and old_directory.exists() and not directory.exists():
        old_directory.rename(directory)
    directory.mkdir(mode=0o700, exist_ok=True)
    passfile = directory / filename
    if passfile.is_symlink() or (passfile.exists() and not passfile.is_file()):
        raise ValueError('Fichier de mot de passe pgAdmin incompatible.')
    descriptor, temporary = tempfile.mkstemp(prefix='.vps-pgpass-', dir=directory)
    try:
        os.chmod(temporary, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='\n') as stream:
            stream.write('127.0.0.1:5432:' + database + ':' + database + ':' + password + '\n')
        os.replace(temporary, passfile)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    if not matches:
        definition = {'Servers': {'1': {
            'Name': project, 'Group': 'Projets VPS', 'Host': '127.0.0.1',
            'Port': 5432, 'MaintenanceDB': database, 'Username': database,
            'DBRestriction': database, 'DBRestrictionType': 'databases', 'Shared': False,
            'UseSSHTunnel': 0, 'TunnelAuthentication': 0, 'TunnelPromptPassword': 0,
            'TunnelKeepAlive': 0, 'KerberosAuthentication': False,
            'Comment': 'VPS Project Generator: ' + project,
            'ConnectionParameters': {'sslmode': 'prefer', 'connect_timeout': 10, 'passfile': filename}
        }}}
        descriptor, source = tempfile.mkstemp(prefix='.vps-import-', suffix='.json', dir=data)
        try:
            with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
                json.dump(definition, stream)
            result = subprocess.run([sys.executable, str(pgdir / 'setup.py'), 'load-servers', source,
                                     '--user', owner['username'], '--sqlite-path', str(settings)],
                                    capture_output=True, text=True, timeout=60, check=False)
            if result.returncode != 0:
                raise ValueError('Import pgAdmin echoue ; configuration existante conservee.')
        finally:
            os.unlink(source)
        # setup.py can return zero after an import error: inspect the stored entry.
        current_owner, stored = inspect()
        registered = [s for s in stored if s['name'] == project and compatible(s)]
        if current_owner['id'] != owner['id'] or len(registered) != 1 or json.loads(registered[0]['connection_params'] or '{}').get('passfile') != filename:
            raise ValueError('Connexion pgAdmin non enregistree ; relancer apres verification de pgAdmin.')
    return owner['email'], 'connexion prete'


if __name__ == '__main__':
    try:
        owner, status = register(Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.stdin.read(256).strip())
        print('pgAdmin : ' + status + ' pour ' + owner + ' (groupe Projets VPS).')
    except Exception:
        # Do not print exception locals, SQL rows or the password supplied on stdin.
        print('Enregistrement pgAdmin impossible : verifier le compte administrateur, la connexion existante et le stockage pgAdmin.', file=sys.stderr)
        sys.exit(1)
PGADMIN_REGISTER
    chown root:vps-pgadmin "$helper" "$helper/register.py"
    chmod 0750 "$helper"
    chmod 0640 "$helper/register.py"
    # Code comes from the generated installer; password only travels on stdin.
    # No --replace: manual registrations and other projects remain in place.
    runuser -u vps-pgadmin -- env HOME=/var/lib/vps-pgadmin /opt/vps-pgadmin/bin/python "$helper/register.py" "$pgdir" "$PROJECT" "$DB_NAME" < "$STATE/db-password" || status=$?
    rm -f -- "$helper/register.py"
    rmdir -- "$helper"
    (( status == 0 )) || die 'Enregistrement pgAdmin echoue. Base conservee ; corriger pgAdmin puis relancer.'
}


write_credentials_summary() {
    local candidate
    safe_file "$STATE/credentials.txt"
    candidate=$(mktemp "$STATE/credentials.XXXXXX")
    {
        printf 'Accès du projet %s\nSite : %s://%s\nCompte Linux : %s\nApplication : %s\n' "$PROJECT" "$(if [[ $HTTPS == 1 ]]; then printf https; else printf http; fi)" "$MAIN_DOMAIN" "$PROJECT" "$APP"
        if [[ $DATABASE != none && -f $STATE/db-password ]]; then
            printf '\nBase %s\nHôte : 127.0.0.1\nPort : %s\nBase : %s\nUtilisateur : %s\nMot de passe : ' "$DATABASE" "$(if [[ $DATABASE == postgresql ]]; then printf 5432; else printf 3306; fi)" "$DB_NAME" "$DB_NAME"
            cat "$STATE/db-password"
            printf '\nConnexion locale sur le VPS ; depuis votre ordinateur, utiliser un tunnel SSH.\n'
        fi

        if [[ -f $APP/$ENV_NAME ]] && [[ -n $(env_value REDIS_PASSWORD) ]]; then
            printf '\nRedis\nHôte : %s\nPort : %s\nUtilisateur : default\nMot de passe : ' "$(env_value REDIS_HOST)" "$(env_value REDIS_PORT)"
            env_value REDIS_PASSWORD
            printf '\n'
        fi
        printf '\nSSH / SFTP\nCompte : %s\n' "$PROJECT"
        printf 'Authentification : clé SSH sélectionnée.\n'

    } > "$candidate"
    chmod 0600 "$candidate"
    mv -f -- "$candidate" "$STATE/credentials.txt"
}

show_credentials_summary() {
    log "Récapitulatif des accès (root 600) : sudo cat $STATE/credentials.txt"
    # /dev/tty bypasses setup_state's tee: passwords never enter the installer log.
    # Noninteractive runs retain the private file and only print its location.
    if { true > /dev/tty; } 2>/dev/null; then
        { printf '\n===== Identifiants du projet =====\n'; cat "$STATE/credentials.txt"; printf '\n'; } > /dev/tty
    fi
}


setup_redis() {
    local current
    select_port "$STATE/redis-port" 16379 17379 0 auto
    REDIS_PORT=$SELECTED_PORT
    if [[ ! -f $STATE/redis-password ]]; then openssl rand -hex 32 > "$STATE/redis-password"; chmod 0600 "$STATE/redis-password"; fi
    REDIS_PASSWORD=$(cat "$STATE/redis-password")
    [[ $REDIS_PASSWORD =~ ^[a-f0-9]{64}$ ]] || die 'Secret Redis invalide.'
    env_require REDIS_HOST 127.0.0.1
    env_require REDIS_PORT "$REDIS_PORT"
    env_require REDIS_PASSWORD "$REDIS_PASSWORD"
    env_require REDIS_URL "redis://default:$REDIS_PASSWORD@127.0.0.1:$REDIS_PORT"
    if [[ $ENV_NEW == 0 ]]; then
        current=$(env_value REDIS_PASSWORD)
        [[ -z $current || $current == "$REDIS_PASSWORD" ]] || die 'REDIS_PASSWORD existant différent ; aucune rotation automatique.'
    fi
    as_project mkdir -p "$SHARED/redis"
    as_project chmod 0700 "$SHARED/redis"
    managed_write "/etc/vps-projects/$PROJECT/redis.conf" 0640 "$PROJECT" <<REDIS
# Managed by VPS Project Generator : $PROJECT
bind 127.0.0.1
protected-mode yes
port $REDIS_PORT
daemonize no
supervised no
requirepass $REDIS_PASSWORD
dir $SHARED/redis
appendonly yes
appendfsync everysec
maxmemory 512mb
maxmemory-policy noeviction
logfile ""
REDIS
    managed_write "/etc/systemd/system/$PROJECT-redis.service" <<UNIT
# Managed by VPS Project Generator : $PROJECT
[Unit]
Description=$PROJECT Redis local isolé
After=network.target
[Service]
Type=simple
User=$PROJECT
Group=$PROJECT
ExecStart=/usr/bin/redis-server /etc/vps-projects/$PROJECT/redis.conf
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$SHARED/redis
StandardOutput=journal
StandardError=journal
[Install]
WantedBy=multi-user.target
UNIT
    systemd-analyze verify "/etc/systemd/system/$PROJECT-redis.service"
    systemctl daemon-reload
    enable_unit "$PROJECT-redis.service"
    REDISCLI_AUTH=$REDIS_PASSWORD redis-cli -h 127.0.0.1 -p "$REDIS_PORT" --no-auth-warning ping | grep -qx PONG || die 'Instance Redis projet non disponible.'
    env_set REDIS_HOST 127.0.0.1; env_set REDIS_PORT "$REDIS_PORT"; env_set REDIS_PASSWORD "$REDIS_PASSWORD"
    env_set REDIS_PREFIX "$PROJECT:"
    env_set REDIS_URL "redis://default:$REDIS_PASSWORD@127.0.0.1:$REDIS_PORT"
    unset REDIS_PASSWORD
}


check_application() {
    as_project test -f "$APP/package.json" && as_project test -f "$APP/site/package.json" || die 'package.json racine ou dossier Next.js absent.'
    node_command -e 'const fs=require("node:fs"), root=JSON.parse(fs.readFileSync("package.json","utf8")), next=JSON.parse(fs.readFileSync(process.argv[1]+"/package.json","utf8")); if(!(next.dependencies?.next || next.devDependencies?.next) || !root.scripts?.build) process.exit(1)' 'site' || die 'Next.js requis dans son dossier ; script build requis à la racine.'
}
configure_env() { env_set NODE_ENV production; }
deploy_application() {
    node_build
    as_project test -f "$APP/site/.next/standalone/site/server.js" || die 'Serveur standalone absent : vérifier output et standaloneDir.'
    as_project test -d "$APP/site/.next/static" || die 'Assets Next.js absents.'
    as_project mkdir -p "$APP/site/.next/standalone/site/.next"
    as_project cp -a "$APP/site/.next/static" "$APP/site/.next/standalone/site/.next/"
    if as_project test -d "$APP/site/public"; then as_project cp -a "$APP/site/public" "$APP/site/.next/standalone/site/"; fi
    if as_project test -d "$APP/site/.next/server"; then as_project cp -a "$APP/site/.next/server" "$APP/site/.next/standalone/site/.next/"; fi
}

setup_php() { :; }


APP_UNITS=()
reserve_application_ports() {
    select_port "$STATE/app-port" 3000 3999 "$REQUESTED_PORT" "$PORT_MODE"
    PORT=$SELECTED_PORT
    select_port "$STATE/404seo-api-port" 4000 4000 4000 manual "$PROJECT-pm2"
    :
}

setup_services() {
    APP_UNITS+=("$PROJECT-redis.service")
    setup_pm2
    :
}

enable_unit() {
    local unit=$1
    if ! systemctl is-enabled --quiet "$unit"; then ENABLED_UNITS+=("$unit"); fi
    if systemctl is-active --quiet "$unit"; then RESTARTED_UNITS+=("$unit"); else STARTED_UNITS+=("$unit"); fi
    systemctl enable "$unit"
    systemctl restart "$unit"
    sleep 1
    local i
    for ((i=0;i<10;i++)); do
        if systemctl is-active --quiet "$unit"; then return 0; fi
        sleep 1
    done
    die "Service inactif : $unit ; journalctl -u $unit"
}
activate_services() {
    local unit
    systemctl daemon-reload
    for unit in "${APP_UNITS[@]}"; do if [[ -n $unit && $unit != "$PROJECT-redis.service" ]]; then enable_unit "$unit"; fi; done

    # Remove only activations previously registered by this project's root state.
    if [[ -f $STATE/units ]]; then
        while IFS= read -r unit; do
            [[ $unit == "$PROJECT"*.service || $unit == "$PROJECT"*.timer ]] || die 'Registre de services invalide.'
            if [[ " ${APP_UNITS[*]} " != *" $unit "* ]]; then
                if systemctl is-enabled --quiet "$unit"; then REMOVED_ENABLED_UNITS+=("$unit"); fi
                if systemctl is-active --quiet "$unit"; then RESTARTED_UNITS+=("$unit"); fi
                systemctl disable --now "$unit"
                log "Service précédemment géré désactivé : $unit"
            fi
        done < "$STATE/units"
    fi
    printf '%s\n' "${APP_UNITS[@]}" | sed '/^$/d' > "$STATE/units"
    nginx -t && systemctl reload nginx
}


CERTIFICATE_READY=0
nginx_site_preflight() {
    install -d -m 0755 /etc/nginx/sites-available /etc/nginx/sites-enabled
    install -d -m 0755 "/var/www/vps-project-acme/$PROJECT/.well-known/acme-challenge"
    local link="/etc/nginx/sites-enabled/$PROJECT.conf" target="/etc/nginx/sites-available/$PROJECT.conf"
    if [[ -e $link || -L $link ]]; then
        [[ -L $link && $(readlink -f "$link") == "$target" ]] || die 'Vhost activé inconnu ; refus de remplacement.'
    fi
    # Check that none of our hosts are already served by another project's config.
    local file host
    for file in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
        [[ -e $file && $(readlink -f "$file") != "$target" ]] || continue
        for host in "${DOMAINS[@]}"; do
            if awk -v h="$host" '$1=="server_name" {for(i=2;i<=NF;i++){gsub(/;/,"",$i);if($i==h)found=1}} END {exit !found}' "$file"; then
                die "Domaine $host déjà configuré ailleurs : $file"
            fi
        done
    done
}
nginx_activate_vhost() {
    local link="/etc/nginx/sites-enabled/$PROJECT.conf" target="/etc/nginx/sites-available/$PROJECT.conf"
    if [[ ! -L $link ]]; then
        ln -s "$target" "$link"
        touch "$TMP/new-nginx-link"
    fi
    # A valid global config can silently omit sites-enabled; verify the actual loaded files.
    if ! nginx -T > "$TMP/nginx-loaded.conf" 2> "$TMP/nginx-validation.log"; then
        cat "$TMP/nginx-validation.log" >&2
        die "Nginx invalide ; nouvelle configuration non activée ; sauvegarde : $BACKUP"
    fi
    cat "$TMP/nginx-validation.log" >&2
    grep -qxF "# Managed by VPS Project Generator : $PROJECT" "$TMP/nginx-loaded.conf" || die "Nginx ignore le vhost $link. Vérifier include /etc/nginx/sites-enabled/*; dans le bloc http de /etc/nginx/nginx.conf."
    if grep -qF 'conflicting server name' "$TMP/nginx-validation.log"; then
        die 'Nginx ignore un domaine en conflit ; corriger les server_name existants avant activation.'
    fi
    systemctl reload nginx || die 'Rechargement Nginx échoué.'
    systemctl is-active --quiet nginx || die 'Nginx inactif après rechargement.'
    log "Vhost chargé et activé : $link"
}
setup_initial_nginx() {
    nginx_site_preflight
    local target="/etc/nginx/sites-available/$PROJECT.conf"
    if [[ -e $target || -L $target ]]; then
        # Preserve a previous deployment while sources/build/services are being prepared.
        assert_managed "$target"
        nginx_prepare_new_hosts "$target"
    else
        managed_write "$target" <<NGINX_INITIAL
# Managed by VPS Project Generator : seo
log_format seo_dashboard '\$host \$remote_addr - \$remote_user [\$time_local] "\$request_method \$uri \$server_protocol" \$status \$body_bytes_sent';
# Pending application deployment
map \$http_upgrade \$seo_connection { default upgrade; '' close; }
server {
    listen 80;
    listen [::]:80;
    server_name seo.404notfood.fr;
    access_log /var/log/nginx/seo-access.log seo_dashboard;
    error_log /var/log/nginx/seo-error.log;
    error_log /var/log/nginx/error.log warn;
    client_max_body_size 34m;
    client_body_timeout 60s;
    send_timeout 60s;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location ^~ /.well-known/acme-challenge/ { root /var/www/vps-project-acme/seo; try_files \$uri =404; }
    location ~ /\.(?!well-known(?:/|\$)) { deny all; }
    location ~* (?:^|/)(?:composer\.(?:json|lock)|package(?:-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|README\.md|manifest\.json|install\.sh)\$ { deny all; }
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    location = /health/ready {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ^~ /api/auth/ {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ~ ^/api/audits/[^/]+/progress\$ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_set_header Accept-Encoding "";
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header X-Accel-Buffering no always;
        proxy_read_timeout 3600s;
    }
    location / {
        default_type text/plain;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header Retry-After 60 always;
        return 503 "Projet seo provisionné. Application en attente de déploiement.\n";
    }
}
NGINX_INITIAL
    fi
    nginx_activate_vhost
}
nginx_prepare_new_hosts() {
    local target=$1 host candidate
    local pending_hosts=() pending_app_hosts=() pending_redirect_hosts=()
    for host in "${DOMAINS[@]}"; do
        if ! awk -v h="$host" '$1=="server_name" {for(i=2;i<=NF;i++){gsub(/;/,"",$i);if($i==h)found=1}} END {exit !found}' "$target"; then
            pending_hosts+=("$host")
        fi
    done
    (( ${#pending_hosts[@]} > 0 )) || return 0
    nginx_classify_pending_hosts
    candidate="$TMP/nginx-new-hosts.conf"
    cat "$target" > "$candidate"
    nginx_pending_connection_map "$candidate"
    printf '\n# Pending additional hostnames\n' >> "$candidate"
    if (( ${#pending_app_hosts[@]} > 0 )); then
        cat >> "$candidate" <<NGINX_NEW_HOSTS
server {
    listen 80;
    listen [::]:80;
    server_name ${pending_app_hosts[*]};
    access_log /var/log/nginx/seo-access.log seo_dashboard;
    error_log /var/log/nginx/seo-error.log;
    error_log /var/log/nginx/error.log warn;
    client_max_body_size 34m;
    client_body_timeout 60s;
    send_timeout 60s;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location ^~ /.well-known/acme-challenge/ { root /var/www/vps-project-acme/seo; try_files \$uri =404; }
    location ~ /\.(?!well-known(?:/|\$)) { deny all; }
    location ~* (?:^|/)(?:composer\.(?:json|lock)|package(?:-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|README\.md|manifest\.json|install\.sh)\$ { deny all; }
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    location = /health/ready {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ^~ /api/auth/ {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ~ ^/api/audits/[^/]+/progress\$ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_set_header Accept-Encoding "";
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header X-Accel-Buffering no always;
        proxy_read_timeout 3600s;
    }
    location / {
        default_type text/plain;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header Retry-After 60 always;
        return 503 "Projet seo provisionné. Application en attente de déploiement.\n";
    }
}
NGINX_NEW_HOSTS
    fi
    if (( ${#pending_redirect_hosts[@]} > 0 )); then
        cat >> "$candidate" <<NGINX_NEW_REDIRECT_HOSTS
server {
    listen 80;
    listen [::]:80;
    server_name ${pending_redirect_hosts[*]};
    access_log /var/log/nginx/seo-access.log seo_dashboard;
    error_log /var/log/nginx/seo-error.log;
    error_log /var/log/nginx/error.log warn;
    client_max_body_size 34m;
    client_body_timeout 60s;
    send_timeout 60s;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location ^~ /.well-known/acme-challenge/ { root /var/www/vps-project-acme/seo; try_files \$uri =404; }
    location / { return 301 https://seo.404notfood.fr\$request_uri; }
}
NGINX_NEW_REDIRECT_HOSTS
    fi
    managed_write "$target" < "$candidate"
}
nginx_classify_pending_hosts() {
    local host
    for host in "${pending_hosts[@]}"; do
        case "$host" in
            '') pending_redirect_hosts+=("$host") ;;
            *) pending_app_hosts+=("$host") ;;
        esac
    done
}
nginx_pending_connection_map() {
    # Nginx variable names are intentionally literal.
    # shellcheck disable=SC2016
    if ! grep -qF 'map $http_upgrade $seo_connection {' "$1"; then
        cat >> "$1" <<'NGINX_PENDING_MAP'
map $http_upgrade $seo_connection { default upgrade; '' close; }
NGINX_PENDING_MAP
    fi
}
nginx_prepare_https_hosts() {
    local target=$1 host candidate
    local pending_hosts=() pending_app_hosts=() pending_redirect_hosts=()
    for host in "${DOMAINS[@]}"; do
        # Keep deployed server blocks. Only hostnames without a TLS block receive a pending HTTPS endpoint.
        if ! awk -v h="$host" '
            $1=="server" && $2=="{" {tls=0;found=0}
            $1=="listen" && /ssl/ {tls=1}
            $1=="server_name" {for(i=2;i<=NF;i++){gsub(/;/,"",$i);if($i==h)found=1}}
            $1=="}" && tls && found {present=1}
            END {exit !present}' "$target"; then
            pending_hosts+=("$host")
        fi
    done
    (( ${#pending_hosts[@]} > 0 )) || return 0
    nginx_classify_pending_hosts
    candidate="$TMP/nginx-new-https-hosts.conf"
    cat "$target" > "$candidate"
    nginx_pending_connection_map "$candidate"
    printf '\n# Pending additional HTTPS hostnames\n' >> "$candidate"
    if (( ${#pending_app_hosts[@]} > 0 )); then
        cat >> "$candidate" <<NGINX_NEW_HTTPS_HOSTS
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${pending_app_hosts[*]};
    ssl_certificate /etc/letsencrypt/live/seo/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seo/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:seo_SSL:10m;
    access_log /var/log/nginx/seo-access.log seo_dashboard;
    error_log /var/log/nginx/seo-error.log;
    error_log /var/log/nginx/error.log warn;
    client_max_body_size 34m;
    client_body_timeout 60s;
    send_timeout 60s;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location ^~ /.well-known/acme-challenge/ { root /var/www/vps-project-acme/seo; try_files \$uri =404; }
    location ~ /\.(?!well-known(?:/|\$)) { deny all; }
    location ~* (?:^|/)(?:composer\.(?:json|lock)|package(?:-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|README\.md|manifest\.json|install\.sh)\$ { deny all; }
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    location = /health/ready {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ^~ /api/auth/ {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ~ ^/api/audits/[^/]+/progress\$ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_set_header Accept-Encoding "";
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header X-Accel-Buffering no always;
        proxy_read_timeout 3600s;
    }
    location / {
        default_type text/plain;
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header Retry-After 60 always;
        return 503 "Projet seo provisionné. Application en attente de déploiement.\n";
    }
}
NGINX_NEW_HTTPS_HOSTS
    fi
    if (( ${#pending_redirect_hosts[@]} > 0 )); then
        cat >> "$candidate" <<NGINX_NEW_HTTPS_REDIRECT_HOSTS
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${pending_redirect_hosts[*]};
    ssl_certificate /etc/letsencrypt/live/seo/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seo/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:seo_SSL:10m;
    access_log /var/log/nginx/seo-access.log seo_dashboard;
    error_log /var/log/nginx/seo-error.log;
    error_log /var/log/nginx/error.log warn;
    client_max_body_size 34m;
    client_body_timeout 60s;
    send_timeout 60s;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location ^~ /.well-known/acme-challenge/ { root /var/www/vps-project-acme/seo; try_files \$uri =404; }
    location / { return 301 https://seo.404notfood.fr\$request_uri; }
}
NGINX_NEW_HTTPS_REDIRECT_HOSTS
    fi
    managed_write "$target" < "$candidate"
    nginx_activate_vhost
}
setup_nginx() {
    nginx_site_preflight
    local target="/etc/nginx/sites-available/$PROJECT.conf"
    if [[ $HTTPS == 1 && -f $STATE/cert-claimed && -f /etc/letsencrypt/live/$PROJECT/fullchain.pem ]]; then
        managed_write "$target" <<NGINX_EXISTING_TLS
# Managed by VPS Project Generator : seo
log_format seo_dashboard '\$host \$remote_addr - \$remote_user [\$time_local] "\$request_method \$uri \$server_protocol" \$status \$body_bytes_sent';
map \$http_upgrade \$seo_connection { default upgrade; '' close; }
server {
    listen 80;
    listen [::]:80;
    server_name seo.404notfood.fr;
    access_log /var/log/nginx/seo-access.log seo_dashboard;
    error_log /var/log/nginx/seo-error.log;
    error_log /var/log/nginx/error.log warn;
    client_max_body_size 34m;
    client_body_timeout 60s;
    send_timeout 60s;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location ^~ /.well-known/acme-challenge/ { root /var/www/vps-project-acme/seo; try_files \$uri =404; }
    location / { return 301 https://seo.404notfood.fr\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name seo.404notfood.fr;
    ssl_certificate /etc/letsencrypt/live/seo/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seo/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:seo_SSL:10m;
    access_log /var/log/nginx/seo-access.log seo_dashboard;
    error_log /var/log/nginx/seo-error.log;
    error_log /var/log/nginx/error.log warn;
    client_max_body_size 34m;
    client_body_timeout 60s;
    send_timeout 60s;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location ^~ /.well-known/acme-challenge/ { root /var/www/vps-project-acme/seo; try_files \$uri =404; }
    location ~ /\.(?!well-known(?:/|\$)) { deny all; }
    location ~* (?:^|/)(?:composer\.(?:json|lock)|package(?:-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|README\.md|manifest\.json|install\.sh)\$ { deny all; }
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    location = /health/ready {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ^~ /api/auth/ {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ~ ^/api/audits/[^/]+/progress\$ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_set_header Accept-Encoding "";
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header X-Accel-Buffering no always;
        proxy_read_timeout 3600s;
    }
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
}
NGINX_EXISTING_TLS
    else
        managed_write "$target" <<NGINX_HTTP
# Managed by VPS Project Generator : seo
log_format seo_dashboard '\$host \$remote_addr - \$remote_user [\$time_local] "\$request_method \$uri \$server_protocol" \$status \$body_bytes_sent';
map \$http_upgrade \$seo_connection { default upgrade; '' close; }
server {
    listen 80;
    listen [::]:80;
    server_name seo.404notfood.fr;
    access_log /var/log/nginx/seo-access.log seo_dashboard;
    error_log /var/log/nginx/seo-error.log;
    error_log /var/log/nginx/error.log warn;
    client_max_body_size 34m;
    client_body_timeout 60s;
    send_timeout 60s;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location ^~ /.well-known/acme-challenge/ { root /var/www/vps-project-acme/seo; try_files \$uri =404; }
    location ~ /\.(?!well-known(?:/|\$)) { deny all; }
    location ~* (?:^|/)(?:composer\.(?:json|lock)|package(?:-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|README\.md|manifest\.json|install\.sh)\$ { deny all; }
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    location = /health/ready {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ^~ /api/auth/ {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ~ ^/api/audits/[^/]+/progress\$ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_set_header Accept-Encoding "";
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header X-Accel-Buffering no always;
        proxy_read_timeout 3600s;
    }
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
}
NGINX_HTTP
    fi
    nginx_activate_vhost
}
request_certificate() {
    [[ $HTTPS == 1 ]] || return 0
    [[ $CERTIFICATE_READY != 1 ]] || return 0
    local host address addresses locals
    locals=$(ip -o addr show | awk '{split($4,a,"/"); print a[1]}')
    for host in "${DOMAINS[@]}"; do
        addresses=$({ dig +short A "$host"; dig +short AAAA "$host"; } | awk '/^[0-9.]+$|^[0-9a-fA-F:]+$/' | sort -u) || die "DNS non résolu : $host"
        [[ -n $addresses ]] || die "DNS vide : $host"
        while IFS= read -r address; do
            grep -qxF "$address" <<< "$locals" || die "DNS $host -> $address absent des interfaces locales. Vérifier A/AAAA ; NAT/CDN nécessite une adaptation manuelle."
        done <<< "$addresses"
    done
    if [[ -d /etc/letsencrypt/live/$PROJECT && ! -f $STATE/cert-claimed ]]; then die 'Nom de certificat préexistant non géré.'; fi
    touch "$STATE/cert-claimed"
    local args=()
    for host in "${DOMAINS[@]}"; do args+=(-d "$host"); done
    certbot certonly --webroot --webroot-path "/var/www/vps-project-acme/$PROJECT" --cert-name "$PROJECT" --email "$EMAIL" --agree-tos --non-interactive --keep-until-expiring --expand --deploy-hook '/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx' "${args[@]}" || die 'Certificat échoué : vérifier DNS A/AAAA, accessibilité publique du port 80 et quotas Let’s Encrypt. HTTP restauré selon la sauvegarde.'
    [[ -s /etc/letsencrypt/live/$PROJECT/fullchain.pem && -s /etc/letsencrypt/live/$PROJECT/privkey.pem ]] || die 'Certbot terminé sans certificat et clé utilisables ; vhost HTTP conservé.'
    CERTIFICATE_READY=1
}
setup_initial_https() {
    [[ $HTTPS == 1 ]] || return 0
    local target="/etc/nginx/sites-available/$PROJECT.conf"
    request_certificate
    # A live deployment keeps its existing HTTP/TLS application during preparation.
    if grep -qxF '# Pending application deployment' "$target"; then
        managed_write "$target" <<NGINX_INITIAL_TLS
# Managed by VPS Project Generator : seo
log_format seo_dashboard '\$host \$remote_addr - \$remote_user [\$time_local] "\$request_method \$uri \$server_protocol" \$status \$body_bytes_sent';
# Pending application deployment
map \$http_upgrade \$seo_connection { default upgrade; '' close; }
server {
    listen 80;
    listen [::]:80;
    server_name seo.404notfood.fr;
    access_log /var/log/nginx/seo-access.log seo_dashboard;
    error_log /var/log/nginx/seo-error.log;
    error_log /var/log/nginx/error.log warn;
    client_max_body_size 34m;
    client_body_timeout 60s;
    send_timeout 60s;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location ^~ /.well-known/acme-challenge/ { root /var/www/vps-project-acme/seo; try_files \$uri =404; }
    location / { return 301 https://seo.404notfood.fr\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name seo.404notfood.fr;
    ssl_certificate /etc/letsencrypt/live/seo/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seo/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:seo_SSL:10m;
    access_log /var/log/nginx/seo-access.log seo_dashboard;
    error_log /var/log/nginx/seo-error.log;
    error_log /var/log/nginx/error.log warn;
    client_max_body_size 34m;
    client_body_timeout 60s;
    send_timeout 60s;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location ^~ /.well-known/acme-challenge/ { root /var/www/vps-project-acme/seo; try_files \$uri =404; }
    location ~ /\.(?!well-known(?:/|\$)) { deny all; }
    location ~* (?:^|/)(?:composer\.(?:json|lock)|package(?:-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|README\.md|manifest\.json|install\.sh)\$ { deny all; }
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    location = /health/ready {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ^~ /api/auth/ {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ~ ^/api/audits/[^/]+/progress\$ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_set_header Accept-Encoding "";
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header X-Accel-Buffering no always;
        proxy_read_timeout 3600s;
    }
    location / {
        default_type text/plain;
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header Retry-After 60 always;
        return 503 "Projet seo provisionné. Application en attente de déploiement.\n";
    }
}
NGINX_INITIAL_TLS
        nginx_activate_vhost
    else
        nginx_prepare_https_hosts "$target"
        nginx_prepare_existing_admin "$target"
    fi
    systemctl is-enabled --quiet certbot.timer || warn 'certbot.timer non activé : activer le renouvellement via le bootstrap.'
}
nginx_prepare_existing_admin() { :; }

setup_https() {
    [[ $HTTPS == 1 ]] || return 0
    request_certificate
    managed_write "/etc/nginx/sites-available/$PROJECT.conf" <<NGINX_TLS
# Managed by VPS Project Generator : seo
log_format seo_dashboard '\$host \$remote_addr - \$remote_user [\$time_local] "\$request_method \$uri \$server_protocol" \$status \$body_bytes_sent';
map \$http_upgrade \$seo_connection { default upgrade; '' close; }
server {
    listen 80;
    listen [::]:80;
    server_name seo.404notfood.fr;
    access_log /var/log/nginx/seo-access.log seo_dashboard;
    error_log /var/log/nginx/seo-error.log;
    error_log /var/log/nginx/error.log warn;
    client_max_body_size 34m;
    client_body_timeout 60s;
    send_timeout 60s;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location ^~ /.well-known/acme-challenge/ { root /var/www/vps-project-acme/seo; try_files \$uri =404; }
    location / { return 301 https://seo.404notfood.fr\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name seo.404notfood.fr;
    ssl_certificate /etc/letsencrypt/live/seo/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seo/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:seo_SSL:10m;
    access_log /var/log/nginx/seo-access.log seo_dashboard;
    error_log /var/log/nginx/seo-error.log;
    error_log /var/log/nginx/error.log warn;
    client_max_body_size 34m;
    client_body_timeout 60s;
    send_timeout 60s;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location ^~ /.well-known/acme-challenge/ { root /var/www/vps-project-acme/seo; try_files \$uri =404; }
    location ~ /\.(?!well-known(?:/|\$)) { deny all; }
    location ~* (?:^|/)(?:composer\.(?:json|lock)|package(?:-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|README\.md|manifest\.json|install\.sh)\$ { deny all; }
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    location = /health/ready {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ^~ /api/auth/ {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
    location ~ ^/api/audits/[^/]+/progress\$ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_set_header Accept-Encoding "";
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header X-Accel-Buffering no always;
        proxy_read_timeout 3600s;
    }
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$seo_connection;
        proxy_read_timeout 60s;
    }
}
NGINX_TLS
    nginx_activate_vhost
    systemctl is-enabled --quiet certbot.timer || warn 'certbot.timer non activé : activer le renouvellement via le bootstrap.'
}


setup_ssh_sandbox() {
    local launcher="/usr/local/libexec/vps-shell-$PROJECT"
    command_exists bwrap || die 'bubblewrap requis : mettre à jour le socle du VPS avant le projet.'
    [[ -d /usr/local/libexec && ! -L /usr/local/libexec && $(stat -c %u /usr/local/libexec) == 0 ]] || die 'Répertoire libexec non conforme.'
    as_project test ! -L "$PROJECT_HOME/.pm2" || die 'Dossier PM2 lié interdit.'
    as_project mkdir -p "$PROJECT_HOME/.pm2"
    managed_write "$launcher" 0755 <<'PROJECT_SANDBOX'
#!/bin/bash -p
# Root-owned login shell. -p ignores BASH_ENV and exported functions before isolation.
set -Eeuo pipefail
export PATH=/usr/bin:/bin
unset BASH_ENV ENV LD_PRELOAD LD_LIBRARY_PATH
project='seo'
mode='shell'
home="/home/$project"
[[ $(/usr/bin/id -un) == "$project" && $EUID != 0 ]] || exit 126
[[ -d $home && ! -L $home && ! -L $home/.pm2 ]] || exit 126
ulimit -Su 512
ulimit -Sn 1024
original=${SSH_ORIGINAL_COMMAND-}
terminal=${TERM:-xterm}
args=(--unshare-user --disable-userns --unshare-pid --unshare-ipc --unshare-uts
      --new-session --die-with-parent --cap-drop ALL --clearenv
      --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/sbin /sbin
      --symlink usr/lib /lib --symlink usr/lib64 /lib64
      --ro-bind /etc /etc --tmpfs /etc/vps-projects
      --ro-bind "/etc/vps-projects/$project" "/etc/vps-projects/$project"
      --ro-bind /opt /opt --tmpfs /home --bind "$home" "$home"
      --tmpfs "$home/.pm2" --tmpfs /root --tmpfs /var --tmpfs /run --symlink /run /var/run
      --size 268435456 --tmpfs /tmp --proc /proc --dev /dev
      --setenv HOME "$home" --setenv USER "$project" --setenv LOGNAME "$project"
      --setenv PATH "$home/.local/bin:/opt/nvm/node-24:/usr/local/bin:/usr/bin:/bin"
      --setenv TERM "$terminal" --chdir "$home")
# Debian may keep resolv.conf under /run; expose that file, not host service sockets.
if [[ -r /etc/resolv.conf ]]; then
    resolver=$(/usr/bin/readlink -f /etc/resolv.conf)
    if [[ $resolver == /run/* ]]; then args+=(--ro-bind "$resolver" "$resolver"); fi
fi
# No fallback to an ordinary host shell if namespaces are unavailable.
if [[ ${1-} == --probe ]]; then exec /usr/bin/bwrap "${args[@]}" /usr/bin/true; fi
if [[ $mode == sftp || $original == /usr/lib/openssh/sftp-server || $original == internal-sftp ]]; then
    exec /usr/bin/bwrap "${args[@]}" /usr/lib/openssh/sftp-server -d "$home"
fi
if [[ -n $original ]]; then exec /usr/bin/bwrap "${args[@]}" /bin/bash -c "$original"; fi
exec /usr/bin/bwrap "${args[@]}" /bin/bash -l
PROJECT_SANDBOX
    # A real unprivileged launch is mandatory before replacing the login shell.
    as_project "$launcher" --probe || die 'Confinement indisponible dans ce noyau/AppArmor ; SSH projet refusé, aucun repli vers un shell libre.'
    # The login shell is selected only after sshd has validated the entire policy.
}

setup_ssh() {
    sshd -t || die 'Configuration SSH existante invalide ; aucune modification SSH globale.'
    systemctl is-active --quiet ssh || die 'Service SSH inactif.'
    local global_before root_before effective shadow_state authentication password_auth=no publickey_auth=no pattern expected
    global_before=$(sshd -T)
    root_before=$(sshd -T -C "user=root,host=$MAIN_DOMAIN,addr=127.0.0.1")
    shadow_state=$(getent shadow "$PROJECT" | awk -F: '{if($2 ~ /^!+$/) print "initial"; else if($2 ~ /^!/) print "locked"; else if($2 ~ /^\*/) print "disabled"; else if($2=="") print "empty"; else print "password"}')
    # Global-only directive: it cannot be emitted inside Match User.
    grep -qx 'permituserenvironment no' <<< "$global_before" || die 'PermitUserEnvironment doit être désactivé dans la configuration SSH globale du socle.'
    [[ -n $shadow_state ]] || die 'État du compte SSH introuvable.'
    [[ $SSH_AUTH == key ]] || die 'Clé SSH obligatoire ; authentification par mot de passe refusée.'
    printf '%s\n' "$PUBLIC_KEY" > "$TMP/project-key.pub"
    ssh-keygen -l -f "$TMP/project-key.pub" >/dev/null || die 'Clé publique SSH invalide.'
    managed_write "/etc/vps-projects/$PROJECT/authorized_keys" 0640 "$PROJECT" < "$TMP/project-key.pub"
    if [[ $shadow_state == locked ]]; then
        die "Compte $PROJECT verrouillé manuellement : déverrouillage explicite requis."
    elif [[ $shadow_state != disabled ]]; then
        # Remove old Linux passwords too, without locking public-key logins.
        usermod --password '*' "$PROJECT"
    fi
    setup_ssh_sandbox
    authentication=publickey; password_auth=no; publickey_auth=yes
    # Match applies only to this project. The bootstrap's administrator/root policy remains unchanged.
    managed_write "/etc/ssh/sshd_config.d/10-vps-project-$PROJECT.conf" 0600 <<SSH_PROJECT
# Managed by vps-project-generator for $PROJECT.
Match User $PROJECT
    AllowUsers $PROJECT
    AllowGroups $PROJECT
    PubkeyAuthentication $publickey_auth
    PasswordAuthentication $password_auth
    KbdInteractiveAuthentication no
    PermitEmptyPasswords no
    AuthenticationMethods $authentication
    AuthorizedKeysFile /etc/vps-projects/$PROJECT/authorized_keys
    ForceCommand /usr/local/libexec/vps-shell-$PROJECT
    PermitUserRC no
    AllowAgentForwarding no
    DisableForwarding yes
    PermitTTY yes
    ChrootDirectory none
    # Forwarding disabled; shared network still requires DB/Redis authentication.
    AllowTcpForwarding no
    AllowStreamLocalForwarding no
    GatewayPorts no
    PermitTunnel no
    X11Forwarding no
SSH_PROJECT
    # Set before validation/reload so rollback restores a previously active project policy as well.
    SSH_RELOAD_REQUIRED=1
    sshd -t || die 'Configuration SSH du projet invalide ; restauration des fichiers avant rechargement.'
    [[ $(sshd -T) == "$global_before" ]] || die 'La configuration projet change la politique SSH globale ; rechargement refusé.'
    [[ $(sshd -T -C "user=root,host=$MAIN_DOMAIN,addr=127.0.0.1") == "$root_before" ]] || die 'La configuration projet change la politique SSH root ; rechargement refusé.'
    effective=$(sshd -T -C "user=$PROJECT,host=$MAIN_DOMAIN,addr=127.0.0.1")
    grep -qx "allowusers $PROJECT" <<< "$effective" || die 'Un bloc SSH existant masque AllowUsers du projet.'
    grep -qx "allowgroups $PROJECT" <<< "$effective" || die 'Un bloc SSH existant masque AllowGroups du projet.'
    grep -qx "passwordauthentication $password_auth" <<< "$effective" || die 'Authentification SSH par mot de passe du projet masquée.'
    grep -qx 'allowtcpforwarding no' <<< "$effective" || die 'Un bloc SSH existant masque le blocage des tunnels du projet.'
    grep -qx 'permittunnel no' <<< "$effective" || die 'Un bloc SSH existant masque PermitTunnel du projet.'
    grep -qx "pubkeyauthentication $publickey_auth" <<< "$effective" || die 'Authentification SSH par clé du projet masquée.'
    grep -qx "authenticationmethods $authentication" <<< "$effective" || die 'Méthodes d’authentification SSH du projet masquées.'
    grep -qx 'permittty yes' <<< "$effective" || die 'Politique terminal SSH du projet masquée.'
    grep -qx "authorizedkeysfile /etc/vps-projects/$PROJECT/authorized_keys" <<< "$effective" || die 'Emplacement des clés SSH du projet masqué.'
    grep -qx "forcecommand /usr/local/libexec/vps-shell-$PROJECT" <<< "$effective" && grep -qx 'chrootdirectory none' <<< "$effective" || die 'Un bloc SSH impose un shell ou un chroot incompatible au projet.'
    while IFS= read -r pattern; do
        # Reject an explicit denial even when it is restricted to a remote host.
        pattern=${pattern%%@*}
        # OpenSSH deny patterns must be evaluated as patterns, rather than quoted literal names.
        # shellcheck disable=SC2254
        case $PROJECT in $pattern) die 'DenyUsers/DenyGroups interdit le compte projet ; réconcilier explicitement la politique SSH.' ;; esac
    done < <(awk '$1=="denyusers" || $1=="denygroups" {for(i=2;i<=NF;i++) print $i}' <<< "$effective")
    awk '$1=="subsystem" && $2=="sftp" {found=1} END{exit !found}' <<< "$effective" || die 'Subsystem sftp absent de sshd_config.'
    for expected in 'permituserrc no' 'permituserenvironment no' 'allowagentforwarding no' 'disableforwarding yes' 'kbdinteractiveauthentication no'; do
        grep -qx "$expected" <<< "$effective" || die "Directive SSH masquée : $expected"
    done
    set_project_login_shell "/usr/local/libexec/vps-shell-$PROJECT"
    systemctl reload ssh
    systemctl is-active --quiet ssh || die 'Service SSH inactif après rechargement.'
    touch "$STATE/ssh-ready"
    log "SSH/SFTP activé pour $PROJECT avec $SSH_AUTH ; dossier de téléversement : $APP. Compte sans sudo."
}


record_dashboard_inventory() {
    # Root-owned metadata only. The dashboard collector reconciles it with the VPS.
    cat > "$STATE/inventory.json.new" <<'VPS_PROJECT_INVENTORY'
{"name":"seo","type":"nextjs","user":"seo","domains":["seo.404notfood.fr"],"database":"postgresql","databaseUser":"seo","app":"/home/seo/app","services":["nginx","seo-security-audit.timer","seo-pm2","seo-redis","seo-backup.timer","seo-monitor.timer"],"processes":["404seo-api","404seo-worker","404seo-scheduler","404seo-cms-worker"]}
VPS_PROJECT_INVENTORY
    chmod 0600 "$STATE/inventory.json.new"
    mv -f -- "$STATE/inventory.json.new" "$STATE/inventory.json"
}
finish_provisioning() {
    COMMITTED=1
    printf 'provisioned\n' > "$STATE/last-stage"
    printf '\nHébergement prêt : %s\nUtilisateur : %s\nApplication : %s\nBase : %s (%s)\nJournal : %s\n' "$MAIN_DOMAIN" "$PROJECT" "$APP" "$DATABASE" "$DB_NAME" "$LOG"
    log 'Compte, accès sélectionnés, vhosts et base préparés. Aucun clone, build ou démarrage applicatif effectué.'
    log "Transférer les sources dans $APP si nécessaire, puis relancer sudo bash ./install.sh sans --provision."
    show_credentials_summary
}

main() {
    (( $# <= 1 )) && [[ ${1:-} == '' || ${1:-} == --preflight || ${1:-} == --provision ]] || die 'Usage : sudo bash ./install.sh [--preflight|--provision]'
    preflight
    if [[ ${1:-} == --preflight ]]; then log 'Préflight terminé sans écriture persistante. Les sources seront contrôlées au déploiement.'; return 0; fi
    setup_state
    run_stage setup_user
    run_stage setup_ssh
    checkpoint_configuration
    record_dashboard_inventory

    run_stage setup_php
    run_stage reserve_application_ports
    run_stage setup_initial_nginx
    checkpoint_configuration
    run_stage setup_initial_https
    checkpoint_configuration

    run_stage setup_database
    checkpoint_configuration
    write_credentials_summary
    run_stage setup_pgadmin_registration
    if [[ ${1:-} == --provision ]]; then finish_provisioning; return 0; fi
    if [[ $SOURCE == present && -z $(as_project find "$APP" -mindepth 1 -maxdepth 1 -print -quit) ]]; then
        log 'Sources à transférer : hébergement préparé avec succès.'
        finish_provisioning; return 0
    fi
    run_stage prepare_source
    run_stage setup_env
    run_stage check_application
    run_stage configure_database_env
    run_stage setup_redis
    run_stage configure_env
    run_stage configure_deployment_env
    run_stage validate_project_env
    run_stage setup_operations
    run_stage setup_browser_dependencies
    run_stage deploy_application
    run_stage setup_dependency_audit
    run_stage audit_dependencies
    run_stage finish_deployment
    run_stage setup_services
    run_stage setup_nginx
    run_stage setup_https
    run_stage activate_services
    run_stage activate_deployment
    run_stage activate_security_audit
    COMMITTED=1
    printf 'complete\n' > "$STATE/last-stage"
    printf '\n========================================\nDéploiement terminé\n========================================\n'
    printf 'Projet : %s\nUtilisateur : %s\nDomaine : %s\nApplication : %s\nPHP : %s\nNode : %s\nBase : %s\nRedis : %s\nHTTPS : %s\nPort local : %s\nJournal : %s\nSauvegardes : %s\n' "$PROJECT" "$PROJECT" "$MAIN_DOMAIN" "$APP" "$PHP_VERSION" "$NODE_BIN" "$DATABASE" "$REDIS_ENABLED" "$HTTPS" "$PORT" "$LOG" "$BACKUP"
    printf 'Services : %s\n' "${APP_UNITS[*]:-aucun}"
    write_credentials_summary
    show_credentials_summary
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
