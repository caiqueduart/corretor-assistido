// Sobe o ambiente de desenvolvimento com um comando: back-end no Docker e front-end com `ng serve`.
// Uso: `npm run dev` na raiz. O banco fica no volume `corretor-dados` e não é apagado.
import { execSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as esperar } from 'node:timers/promises';

const raiz = join(import.meta.dirname, '..');
const envBack = join(raiz, 'apps/backend/.env');
const saude = 'http://localhost:8080/healthz';

// Os comandos são fixos (sem entrada do usuário), então rodam como uma linha só no shell.
function rodar(comando) {
    return spawnSync(comando, { cwd: raiz, stdio: 'inherit', shell: true }).status === 0;
}

function dockerNoAr() {
    try {
        execSync('docker info', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

async function garantirDocker() {
    if (dockerNoAr()) return;

    const desktop =
        process.platform === 'win32' &&
        join(process.env.LOCALAPPDATA ?? '', 'Programs/DockerDesktop/Docker Desktop.exe');
    const desktopPadrao = 'C:/Program Files/Docker/Docker/Docker Desktop.exe';
    const executavel = [desktop, desktopPadrao].find((caminho) => caminho && existsSync(caminho));

    if (!executavel) {
        throw new Error('O Docker não está rodando. Abra o Docker Desktop e rode de novo.');
    }

    console.log('Abrindo o Docker Desktop…');
    spawn(executavel, { detached: true, stdio: 'ignore' }).unref();

    for (let i = 0; i < 60; i++) {
        await esperar(3000);
        if (dockerNoAr()) return;
    }

    throw new Error('O Docker Desktop não respondeu em 3 minutos. Abra-o manualmente e rode de novo.');
}

function garantirEnv() {
    if (!existsSync(envBack)) {
        copyFileSync(join(raiz, 'apps/backend/.env.example'), envBack);
        console.log('Criei apps/backend/.env a partir do exemplo. Defina ADMIN_SENHA (10+ caracteres) e rode de novo.');
        process.exit(1);
    }

    if (!/^ADMIN_SENHA=.{10,}$/m.test(readFileSync(envBack, 'utf8'))) {
        console.log(
            'Aviso: sem ADMIN_SENHA em apps/backend/.env, a senha do admin é gerada e aparece só uma vez no log.',
        );
    }
}

async function respondeu(url) {
    try {
        return (await fetch(url)).ok;
    } catch {
        return false;
    }
}

async function esperarBackend() {
    for (let i = 0; i < 60; i++) {
        if (await respondeu(saude)) return;
        await esperar(1000);
    }

    throw new Error('O back-end não respondeu. Veja o log com `npm run back:logs`.');
}

try {
    garantirEnv();
    await garantirDocker();

    // Idempotente: só cria o volume do banco se ele ainda não existir.
    execSync('docker volume create corretor-dados', { stdio: 'ignore' });

    console.log('Subindo o back-end (corretor-assistido)…');
    if (!rodar('docker compose up -d --build')) {
        throw new Error(
            'Falha ao subir o back-end. Se a porta 8080 estiver ocupada, pare o contêiner antigo no Docker Desktop.',
        );
    }

    await esperarBackend();
    console.log(`Back-end no ar: ${saude.replace('/healthz', '/docs/')}`);
} catch (erro) {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exit(1);
}

const front = 'http://localhost:4200';

if (await respondeu(front)) {
    console.log(`O front-end já está rodando em ${front}.`);
    process.exit(0);
}

spawn('npm start --workspace frontend', { cwd: raiz, stdio: 'inherit', shell: true }).on('exit', (codigo) =>
    process.exit(codigo ?? 0),
);
