# 404seo

Stack Docker générée par Container Stack Generator.

## Démarrage

Initialisez le dépôt (Bash requis, Git Bash sous Windows) :

```bash
bash init.sh
```

```bash
bash start-containers.sh
bash stop-containers.sh
```

Le script reconstruit les images et lance les services. Compose crée les réseaux et volumes du projet.

Les sources et les dépendances proviennent de votre dépôt. Les fichiers d'environnement générés sont conservés pendant le clone. Adaptez la commande de démarrage du Dockerfile à votre application.

## Accès

- Application : https://seo.test
- pgadmin : http://localhost:8083

## Configuration

Les ports publiés servent aux connexions depuis la machine hôte. Entre containers, utilisez les noms de services et les ports internes : MySQL/MariaDB 3306, PostgreSQL 5432, MongoDB 27017, Redis 6379.

Les mots de passe générés sont partagés entre `.env` et les fichiers de configuration applicatifs. Si vous modifiez un mot de passe, mettez à jour tous les fichiers concernés. Ne commitez pas les fichiers contenant des secrets.

## Commandes

```bash
docker compose up -d --build
docker compose logs -f
docker compose down
```
