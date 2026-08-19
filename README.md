# SMAX Triagem - TJSP

Modulo de triagem para o sistema SMAX do Tribunal de Justica de Sao Paulo.

**Versao atual:** 1.0

---

## 1. Pre-requisito: instalar o Tampermonkey

1. Instale a extensao **Tampermonkey** na loja do seu navegador (Chrome, Edge ou Firefox)
2. Va em **Gerenciar Extensoes** e ative o **Modo do desenvolvedor**
3. No Tampermonkey, acesse **Painel de Controle** > **Configuracoes** e marque:
   - Permitir scripts de usuario
   - Permitir acesso a abas
   - Permitir requisicoes remotas

---

## 2. Instalacao

Clique no link abaixo para instalar diretamente pelo Tampermonkey:

**[Instalar SMAX Triagem - TJSP](https://github.com/rsalvessap/SMAX-Triagem/raw/refs/heads/master/SMAX/SMAX%20Triagem%20-%20TJSP.user.js)**

> O Tampermonkey abrira uma aba de confirmacao. Clique em **Instalar**.

O script funciona no SMAX e no eProc -- nao e necessario instalar nada separado.

---

## 3. Configuracao inicial

Ao abrir o SMAX na tela de chamados, uma **engrenagem** aparecera no canto inferior direito. Clique nela para abrir o painel de configuracoes.

### 3.1 Identificacao

No campo **"Quem e voce?"** (aba Geral), busque e selecione seu proprio nome. Isso vincula suas acoes ao seu usuario no sistema.

### 3.2 Configuracao compartilhada (SharedConfig)

Na aba **Geral**, na secao **Config. Compartilhada**, voce vera a URL do SharedConfig ja preenchida por padrao:

```
https://raw.githubusercontent.com/rsalvessap/SMAX-TOOLS/master/shared-config.json
```

Esta URL aponta para um arquivo JSON hospedado no GitHub que contem:
- Equipes e regras de roteamento
- Mapeamento de nomes e digitos
- Lista de ausentes
- Scripts compartilhados de solucao e discussao

**Nao altere esta URL** a menos que seja orientado a faze-lo. A sincronizacao e automatica: o script busca atualizacoes a cada 1 hora e aplica as configuracoes recebidas.

Para forcar uma atualizacao manual, clique no botao **Atualizar** ao lado da URL.

### 3.3 Equipes

As equipes sao configuradas e gerenciadas centralmente pelo administrador. Voce recebe automaticamente:

- Definicoes de equipes (2.2.1, 2.2.2, Geral, etc.)
- Regras de roteamento por GSE, local de divulgacao e texto
- Membros e faixas de digitos de cada equipe
- Assinaturas de equipe

Equipes compartilhadas aparecem com o badge **Compartilhada** e sao somente leitura.

---

## 4. Modulos

### 4.1 TriageHUD (Painel de Triagem)

Acesse via **Configuracoes > Triagem > Abrir TriageHUD**.

Painel completo para triagem de chamados.

#### Fila de triagem

- **Fila automatica** -- construida a partir dos chamados interceptados da API do SMAX
- **Filtro por finais** -- filtra a fila pelos ultimos 2 digitos do ID do chamado
- **Ordenacao** -- VIP primeiro, depois por data (mais antigo primeiro)
- **Navegacao** -- setas ou teclado para navegar entre chamados

#### Painel de detalhes

**Cabecalho:**
- ID do chamado (link para o SMAX), badges VIP e Global, solicitante, localizacao, numero do processo CNJ, data de criacao

**Campos editaveis:**

| Campo | Funcao |
|-------|--------|
| Urgencia | 4 niveis (Baixa, Media, Alta, Critica) com mapeamento automatico de ImpactScope |
| Equipe | Selecao de equipe com sugestao automatica por regras de GSE e matchers |
| Responsavel | Atribuicao de analista com sugestao por faixa de digitos |
| GSE | Alterar grupo de suporte com busca e filtro |
| Status | Alterar status do chamado |
| Global ID | Vincular a chamado global pai (cria relacionamento + define status de escalacao) |

**Editor de solucao:**
- Editor rico completo: negrito, italico, sublinhado, tachado, listas, links, cores, tamanhos de fonte, limpeza de formatacao
- Seletor de assinaturas (equipe e pessoais)
- Seletor de scripts de solucao

**Painel de discussoes:**
- Lista de todas as discussoes do chamado com badges de privacidade (PUBLIC/INTERNAL)
- Botao "Replicar" copia conteudo para o editor de solucao

**Anexos:**
- Chips de anexos do chamado. Imagens abrem em modal com navegacao por teclado. PDFs abrem em nova aba.

**Envio (COMMIT):**
- Executa todas as alteracoes staged de uma vez: urgencia, atribuicao, solucao, GSE, status, vinculacao global

### 4.2 Scripts/Templates

Acesse via **Configuracoes > Scripts**.

- **Duas abas:** Solucao e Discussao
- Crie, edite e exclua scripts localmente
- **Sincronizacao:** importa scripts do SharedConfig (GitHub)
- Scripts compartilhados aparecem com badge "Compartilhado" e nao podem ser editados localmente

### 4.3 Assinaturas

Acesse via **Configuracoes > Assinaturas**.

- **Assinaturas pessoais:** criar, editar e excluir com pre-visualizacao em tempo real
- **Assinaturas por equipe:** configuradas centralmente pelo administrador (somente leitura)
- Inseridas no editor via botao de assinatura

### 4.4 Destaque de Solicitantes

Acesse via **Configuracoes > Destaque**.

- Busca qualquer pessoa no SMAX
- Adicione solicitantes a lista de destaque para identifica-los rapidamente nos chamados

### 4.5 Relatorio de Atividades

Acesse via **Configuracoes > Geral**.

- Gera relatorio por periodo (data inicio/fim)
- Resumo: chamados triados, vinculados, transferidos, designados, alteracoes de status
- Tabela detalhada com cada acao realizada
- Exportacao em CSV
- Sincronizacao automatica com o servidor

### 4.6 Consulta de Processos no eProc

Numeros de processo no formato CNJ sao detectados automaticamente em descricoes e discussoes.

**Formatos reconhecidos:**
- Formatado: `4000439-14.2026.8.26.0201`
- Bruto (20 digitos): `40004391420268260201`

Clique no numero e uma nova aba do eProc abre ja com a pesquisa executada (requer eProc aberto e logado).

---

## 5. Temas

Tres temas disponiveis, alternados pelo botao no canto superior do HUD:

| Tema | Descricao |
|------|-----------|
| Light | Fundo claro, texto escuro |
| Dark | Fundo escuro, texto claro |
| Gray | Tons neutros com acentos dourados |

A preferencia e salva e persiste entre sessoes.

---

## 6. Atalhos de teclado

| Tecla | Acao |
|-------|------|
| ESC | Fecha o painel ativo |
| Setas esquerda/direita | Navega entre imagens no visualizador de anexos |

---

## 7. Atualizacoes

O script se atualiza automaticamente pelo Tampermonkey quando uma nova versao e publicada no repositorio. Para verificar manualmente:

1. Abra o Tampermonkey > **Painel de Controle**
2. Clique na aba **Utilitarios**
3. Clique em **Verificar atualizacoes**
