/**
 * Compressao e cache dos arquivos servidos pelo Express (server.cjs).
 *
 * Fica num modulo separado porque o server.cjs abre a porta ao ser importado: assim o teste monta um
 * app pequeno com as MESMAS funcoes e mede o header de verdade, em vez de ler o fonte com regex.
 *
 *  - `compressao()`: gzip no HTML/JS/CSS do SPA e no JSON da API (o proprio compression decide pelo
 *    Content-Type e so comprime resposta acima do limite, para nao gastar CPU com resposta curta).
 *  - `estaticos(dir)`: index.html nunca em cache (aponta para chunks com hash que mudam a cada deploy);
 *    o que esta em /assets/ ja tem hash no nome, entao pode ser imutavel por um ano.
 */
const compression = require('compression');
const express = require('express');

/** 1 ano em segundos: o maximo recomendado para arquivo com hash no nome. */
const UM_ANO = 31536000;

const CACHE_IMUTAVEL = `public, max-age=${UM_ANO}, immutable`;
const CACHE_SEM_CACHE = 'no-store, must-revalidate';

function compressao() {
    return compression({
        filter(req, res) {
            // valvula de escape para depuracao e para stream que nao pode ser bufferizado
            if (req.headers['x-no-compression']) return false;
            return compression.filter(req, res);
        },
    });
}

function estaticos(dir) {
    return express.static(dir, {
        index: false,
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('index.html')) {
                res.setHeader('Cache-Control', CACHE_SEM_CACHE);
            } else if (/[\\/]assets[\\/]/.test(filePath)) {
                res.setHeader('Cache-Control', CACHE_IMUTAVEL);
            }
        },
    });
}

module.exports = { compressao, estaticos, UM_ANO, CACHE_IMUTAVEL, CACHE_SEM_CACHE };
