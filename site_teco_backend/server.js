const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const bcrypt = require('bcrypt');
const saltRounds = 10;

const app = express();
app.use(cors());
app.use(express.json());

// CONFIGURAÇÃO CORRIGIDA: Serve todos os arquivos estáticos
// O '..' sobe da pasta 'site_teco_backend' para a RAIZ do projeto, onde estão todos os arquivos HTML.
app.use(express.static(path.join(__dirname, '..')));

// Rota Raiz (GET /): Carrega a página inicial principal (index.html)
// CORREÇÃO: Busca o arquivo 'index.html' diretamente na raiz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html')); 
});

// Conexão com o banco SQLite
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error(err);
    else console.log("Servidor: Banco de dados conectado!");
});

// Criação das tabelas (CÓDIGO LIMPO)
db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY,
        nomeRazaoSocial TEXT,
        dataCadastro TEXT,
        cpfCnpj TEXT,
        nomeCompleto TEXT,
        endereco TEXT,
        bairro TEXT,
        cep TEXT,
        cidade TEXT,
        uf TEXT,
        fone TEXT
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY,
        item TEXT,
        codigo TEXT,
        quantidade INTEGER,
        numeroSerie TEXT,
        dataEntrada TEXT,
        dataSaida TEXT,
        descricao TEXT
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE,
        password_hash TEXT NOT NULL
    )
`);

/* --------------------- FUNÇÕES AUXILIARES DE INSERÇÃO ---------------------- */

// 1. Função de INSERT específica para Clientes
function performClientInsert(id, c, res) {
    db.run(
        `INSERT INTO clientes (id, nomeRazaoSocial, dataCadastro, cpfCnpj, nomeCompleto, endereco, bairro, cep, cidade, uf, fone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id, c.nomeRazaoSocial, c.dataCadastro, c.cpfCnpj, c.nomeCompleto, 
            c.endereco, c.bairro, c.cep, c.cidade, c.uf, c.fone
        ],
        function (err) {
            if (err) {
                console.error("Erro ao cadastrar cliente:", err.message);
                return res.status(500).json({ error: "Falha ao cadastrar o cliente." });
            }
            res.json({ id: id, message: "Cliente cadastrado com sucesso!" }); 
        }
    );
}

// 2. Função de INSERT específica para Produtos
function performProductInsert(id, p, res) {
    db.run(
        `INSERT INTO produtos (id, item, codigo, quantidade, numeroSerie, dataEntrada, dataSaida, descricao)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id, p.item, p.codigo, p.quantidade, p.numeroSerie,
            p.dataEntrada, p.dataSaida, p.descricao
        ],
        function (err) {
            if (err) {
                console.error("Erro ao cadastrar produto:", err.message);
                return res.status(500).json({ error: "Falha ao cadastrar o produto." });
            }
            res.json({ id: id, message: "Produto cadastrado com sucesso!" }); 
        }
    );
}

// FUNÇÃO PARA CRIAR O USUÁRIO PADRÃO
function createDefaultUser() {
    const password = '1234'; 

    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) {
            console.error("Erro ao gerar hash inicial:", err);
            return;
        }

        const username = 'admin';
        
        db.get('SELECT id FROM usuarios WHERE username = ?', [username], (err, row) => {
            if (err) {
                console.error("Erro ao verificar usuário padrão:", err.message);
                return;
            }
            if (!row) {
                db.run('INSERT INTO usuarios (username, password_hash) VALUES (?, ?)', [username, hash], function(err) {
                    if (err) {
                        console.error("Erro ao inserir usuário padrão:", err.message);
                    } else {
                        console.log(`Usuário padrão '${username}' inserido com sucesso.`);
                    }
                });
            } else {
                console.log(`Usuário padrão '${username}' já existe.`);
            }
        });
    });
}

db.on('open', createDefaultUser);

// 3. Função principal de busca de ID (findAndInsert)
function findAndInsert(tableName, data, res, insertFunction) {
    
    const gapQuery = 'SELECT t1.id + 1 AS next_id FROM "' + tableName + '" t1 WHERE NOT EXISTS (SELECT 1 FROM "' + tableName + '" t2 WHERE t2.id = t1.id + 1) ORDER BY t1.id ASC LIMIT 1';

    db.get(gapQuery, (err, row) => {
        if (err) {
            console.error(`Erro ao buscar lacuna em ${tableName}:`, err.message);
            return res.status(500).json({ error: "Falha interna na busca de ID." });
        }

        let novoId = (row && row.next_id) ? row.next_id : null;

        if (novoId === null || novoId === 1) { 
            
            const maxQuery = 'SELECT MAX(id) AS max_id FROM "' + tableName + '"';
            
            db.get(maxQuery, (err, row) => {
                if (err) {
                    return res.status(500).json({ error: "Falha interna ao buscar MAX ID." });
                }
                novoId = (row && row.max_id) ? row.max_id + 1 : 1;
                
                insertFunction(novoId, data, res);
            });
        } else {
            insertFunction(novoId, data, res);
        }
    });
}

/* --------------------- ROTAS CLIENTES ---------------------- */

// 1. Cadastrar cliente (POST /clientes)
app.post('/clientes', (req, res) => {
    findAndInsert('clientes', req.body, res, performClientInsert);
});


// 2. Listar todos os clientes (GET /clientes)
app.get('/clientes', (req, res) => {
    db.all(`SELECT * FROM clientes ORDER BY nomeRazaoSocial ASC`, [], (err, rows) => {
        if (err) {
            console.error("Erro ao listar clientes:", err.message);
            return res.status(500).json({ error: "Falha ao listar clientes." });
        }
        res.json(rows);
    });
});

// 3. Buscar cliente por termo (GET /clientes/search?termo=...)
app.get('/clientes/search', (req, res) => {
    const termoBusca = req.query.termo;
    const query = `
        SELECT * FROM clientes 
        WHERE nomeRazaoSocial LIKE ? OR cpfCnpj LIKE ?
    `;
    const searchParam = `%${termoBusca}%`; 

    db.all(query, [searchParam, searchParam], (err, rows) => {
        if (err) {
            console.error("Erro na busca SQL de clientes:", err.message);
            return res.status(500).json({ error: "Erro interno do servidor ao buscar clientes." });
        }
        res.json(rows);
    });
});

// 4. Deletar cliente por ID (DELETE /clientes/:id)
app.delete('/clientes/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM clientes WHERE id = ?`, id, function (err) {
        if (err) {
            console.error("Erro ao deletar cliente:", err.message);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: "Cliente não encontrado." });
        }
        res.json({ message: `Cliente (ID: ${id}) deletado com sucesso!`, changes: this.changes });
    });
});
/* --------------------- ROTAS PRODUTOS ---------------------- */

// ROTA ADICIONADA: Listar todos os produtos (GET /produtos)
app.get('/produtos', (req, res) => {
    db.all(`SELECT * FROM produtos ORDER BY dataEntrada DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Cadastrar produto (POST /produtos)
app.post('/produtos', (req, res) => {
    findAndInsert('produtos', req.body, res, performProductInsert);
});

// Buscar produto por nome (GET /produtos/search)
app.get('/produtos/search', (req, res) => {
    const codigoBusca = req.query.codigo; 

    db.all(`SELECT * FROM produtos WHERE codigo = ?`, [codigoBusca], (err, rows) => { 
        if (err) {
             console.error("Erro na busca SQL:", err.message);
             return res.status(500).json({ error: "Erro interno do servidor de busca." });
        }
        res.json(rows);
    });
});

// Deletar produto por ID
app.delete('/produtos/:id', (req, res) => {
    const id = req.params.id; 

    db.run(`DELETE FROM produtos WHERE id = ?`, id, function (err) {
        if (err) return res.status(500).json({ error: err.message });

        if (this.changes === 0) {
            return res.status(404).json({ message: "Produto não encontrado." });
        }
        
        res.json({ message: `Produto deletado com sucesso!`, changes: this.changes });
    });
});

/* --------------------- ROTAS DE AUTENTICAÇÃO ---------------------- */

// Rota de Login (POST /login)
app.post('/login', (req, res) => {
    const { user, senha } = req.body;

    if (!user || !senha) {
        return res.status(400).json({ error: "Usuário e senha são obrigatórios." });
    }

    // 1. Busca o hash da senha no banco
    db.get('SELECT password_hash FROM usuarios WHERE username = ?', [user], (err, row) => {
        if (err) {
            console.error("Erro na busca de login:", err.message);
            return res.status(500).json({ error: "Erro interno do servidor." });
        }
        
        // 2. Se o usuário não existir
        if (!row) {
            return res.status(401).json({ message: "Usuário ou senha inválidos." });
        }

        const storedHash = row.password_hash;
        
        // 3. Compara a senha digitada com o hash armazenado
        bcrypt.compare(senha, storedHash, (err, result) => {
            if (err) {
                console.error("Erro na comparação de hash:", err);
                return res.status(500).json({ error: "Erro interno do servidor." });
            }

            if (result) {
                // SUCESSO!
                res.json({ success: true, message: "Login realizado com sucesso!" });
            } else {
                // FALHA!
                res.status(401).json({ message: "Usuário ou senha inválidos." });
            }
        });
    });
});
/* --------------------- INICIAR SERVIDOR ---------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});