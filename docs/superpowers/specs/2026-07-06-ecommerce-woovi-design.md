# Especificação de Design: E-commerce Nativo & Integração Woovi no Abbla

Este documento especifica a arquitetura e o design técnico para a inserção de uma estrutura de e-commerce completa no ecossistema do Abbla. A integração contempla catálogo de produtos com variações físicas, carrinho de compras, checkout público nativo integrado à API de pagamentos da Woovi (Pix e subcontas), ferramentas de sugestão no chat (Operador e IA) e lembretes de recompra programados.

## 1. Visão Geral e Arquitetura

O e-commerce do Abbla será construído diretamente sobre o stack atual do projeto: Next.js (App Router), Supabase (PostgreSQL, Row Level Security e Realtime) e Tailwind CSS.

### Principais Subsistemas
1.  **Mecanismo de Onboarding e Credenciais:** Processo de solicitação de subconta da Woovi integrado ao painel de configurações de cada Tenant, com controle manual de aprovação via Super Admin e armazenamento criptografado das chaves de API (`App ID` e `Secret Key`).
2.  **Painel de E-commerce Dedicado (Dashboard do Tenant):** Uma seção administrativa completa (`/ecommerce` ou `/loja`) contendo métricas de vendas, histórico de pedidos, controle de catálogo, estoque de variações, configurações de identidade visual e dados de pagamento.
3.  **Identidade Visual da Loja:** Campos na configuração para adicionar um **Logotipo** (upload via Supabase Storage) e uma **Descrição da Loja** (ex: bio, horário de funcionamento, foco da marca).
4.  **Suporte a Produtos Físicos e Digitais:** Configuração no produto para definir o tipo (`physical` ou `digital` - serviços, ebooks, mentorias). 
    *   *Produtos Digitais:* Não possuem custo de frete e ativam a entrega automática de conteúdo (link ou instruções de acesso) via WhatsApp após a confirmação do pagamento.
5.  **Endereços de Clientes Recorrentes (Autopreenchimento):** Tabela de endereços vinculada ao cadastro de contatos do CRM. No checkout de produtos físicos, após digitar o telefone, o cliente pode selecionar um endereço pré-cadastrado para acelerar a compra.
6.  **Configuração de Frete:** Opção de taxa de entrega fixa por loja (geral) e possibilidade de precificação de frete customizado por produto (ignorado para produtos digitais).
7.  **Sistema de Upsell no Checkout:** Recomendação inteligente de produtos adicionais ("Leve também...") exibida no carrinho de compras ou tela de checkout para aumentar o ticket médio.
8.  **Storefront Pública:** Área aberta ao cliente final sob a rota `/shop/[tenant-slug]`, otimizada para SEO, contendo cabeçalho com logo e descrição da loja, vitrine de produtos, páginas de detalhes, carrinho de compras persistente e checkout Pix nativo integrado com a Woovi.
9.  **Integração no Inbox (Chat & IA):** 
    *   *Operador Humano:* Busca e envio de links ou geração de Pix direto na interface da conversa.
    *   *IA (Gemini MCP):* Extensão do agente de chat para pesquisar no catálogo e gerar cobranças Pix via ferramentas estruturadas.
10. **Automações de Pagamento e Recompra:** Webhook da Woovi para alteração automática de status de pedidos, decremento de estoque (apenas produtos físicos), entrega de conteúdo digital, mudança de etapa no pipeline do CRM, mensagem automática de confirmação de pagamento e envio de lembrete de recompra após N dias.

---

## 2. Modelagem do Banco de Dados (Supabase SQL)

Para suportar estas novas entidades, o banco de dados Supabase receberá uma nova migração contendo as seguintes tabelas e regras de RLS (Row Level Security):

```sql
-- 1. Enum para status de onboarding da Woovi
CREATE TYPE woovi_onboarding_status AS ENUM ('none', 'pending_approval', 'approved');

-- 2. Tabela de configuração Woovi do Tenant
CREATE TABLE IF NOT EXISTS woovi_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
    onboarding_status woovi_onboarding_status NOT NULL DEFAULT 'none',
    app_id TEXT, -- Armazenado criptografado
    secret_key TEXT, -- Armazenado criptografado
    default_shipping_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00, -- Frete padrão da loja
    store_description TEXT, -- Biografia/Descrição da loja pública
    store_logo_url TEXT, -- URL do logotipo da loja pública
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS para woovi_config
ALTER TABLE woovi_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can manage their own woovi_config" 
    ON woovi_config FOR ALL 
    USING (account_id = auth.uid() OR account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- 3. Categorias de Produtos
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (account_id, slug)
);

-- RLS para product_categories
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active categories" 
    ON product_categories FOR SELECT 
    USING (true);
CREATE POLICY "Tenants can manage their own categories" 
    ON product_categories FOR ALL 
    USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- 4. Tabela Principal de Produtos
CREATE TYPE product_type_enum AS ENUM ('physical', 'digital');

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    images TEXT[] DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT true,
    product_type product_type_enum NOT NULL DEFAULT 'physical', -- físico ou digital (ebooks, serviços, mentoria)
    digital_content TEXT, -- Instruções ou link de acesso entregue pós-pagamento
    repurchase_reminder_days INT, -- Dias para recompra (null = inativo)
    shipping_fee NUMERIC(10, 2), -- Frete específico (se null, usa default_shipping_fee da loja. Ignorado para digitais)
    upsell_product_id UUID REFERENCES products(id) ON DELETE SET NULL, -- Produto sugerido para upsell
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (account_id, slug)
);

-- RLS para products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active products" 
    ON products FOR SELECT 
    USING (active = true);
CREATE POLICY "Tenants can manage their own products" 
    ON products FOR ALL 
    USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- 5. Variações Físicas dos Produtos (Preços e Estoques)
CREATE TABLE IF NOT EXISTS product_variations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku TEXT,
    price NUMERIC(10, 2) NOT NULL,
    stock INT NOT NULL DEFAULT 0, -- Para serviços/mentorias, estoque pode ser alto ou ilimitado
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb, -- Ex: {"size": "M", "color": "Preto"}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS para product_variations
ALTER TABLE product_variations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active variations" 
    ON product_variations FOR SELECT 
    USING (product_id IN (SELECT id FROM products WHERE active = true));
CREATE POLICY "Tenants can manage their own variations" 
    ON product_variations FOR ALL 
    USING (product_id IN (SELECT id FROM products WHERE account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid())));

-- 6. Endereços de Entrega dos Clientes (vinculados ao Contato CRM)
CREATE TABLE IF NOT EXISTS shipping_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    label TEXT DEFAULT 'Casa', -- Identificação do endereço
    street TEXT NOT NULL,
    number TEXT NOT NULL,
    complement TEXT,
    neighborhood TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS para shipping_addresses
ALTER TABLE shipping_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can view contact addresses"
    ON shipping_addresses FOR ALL
    USING (contact_id IN (SELECT id FROM contacts WHERE account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "Public can view and insert shipping addresses during checkout"
    ON shipping_addresses FOR ALL
    USING (true);

-- 7. Pedidos (Orders)
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'cancelled');

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    status order_status NOT NULL DEFAULT 'pending',
    shipping_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00, -- Valor cobrado de frete (R$ 0.00 se apenas itens digitais)
    items_amount NUMERIC(10, 2) NOT NULL, -- Valor total dos produtos
    total_amount NUMERIC(10, 2) NOT NULL, -- total_amount = items_amount + shipping_amount
    customer_info JSONB NOT NULL, -- Ex: {"name": "...", "phone": "+55...", "email": "...", "address": {...}}
    shipping_address_id UUID REFERENCES shipping_addresses(id) ON DELETE SET NULL, -- Nulo para serviços/infoprodutos
    woovi_correlation_id TEXT UNIQUE,
    woovi_qrcode_image TEXT,
    woovi_brcode TEXT,
    repurchase_reminder_at TIMESTAMP WITH TIME ZONE,
    repurchase_reminder_sent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS para orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can view and manage their own orders" 
    ON orders FOR ALL 
    USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Public can view and read their own order via ID" 
    ON orders FOR SELECT 
    USING (true);
CREATE POLICY "Public can insert order" 
    ON orders FOR INSERT 
    WITH CHECK (true);

-- 8. Itens do Pedido (Order Items)
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_variation_id UUID NOT NULL REFERENCES product_variations(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL,
    is_upsell BOOLEAN NOT NULL DEFAULT false -- Identifica se o item foi comprado via oferta de upsell
);

-- RLS para order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can manage their own order items" 
    ON order_items FOR ALL 
    USING (order_id IN (SELECT id FROM orders WHERE account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "Public can insert order items" 
    ON order_items FOR INSERT 
    WITH CHECK (true);
CREATE POLICY "Public can view order items" 
    ON order_items FOR SELECT 
    USING (true);
```

---

## 3. Painel E-commerce Administrativo (Dashboard do Tenant)

Para que o tenant administre tudo com facilidade, criaremos uma rota administrativa dedicada sob `/ecommerce` (ou linkado na barra lateral sob o ícone de sacola/carrinho "Loja"):

*   **Visão Geral (Overview):**
    *   Métricas de vendas acumuladas, receita bruta e ticket médio do e-commerce.
    *   Resumos de pedidos do dia (aguardando pagamento, pagos, cancelados).
*   **Catálogo de Produtos:**
    *   Listagem paginada e busca de produtos.
    *   Página de cadastro/edição de produtos integrando:
        *   Formulário de dados do produto e imagens.
        *   Seletor de tipo de produto: **Físico** ou **Digital (Serviço, E-book, Mentoria)**.
        *   Se selecionado **Digital**, exibe caixa de texto para as **Instruções/Link de Acesso** (`digital_content`).
        *   Variações físicas ou grades (tamanhos, cores, preço individual e quantidade em estoque).
        *   Configuração do Lembrete de Recompra (Dias).
        *   Configuração do Frete Customizado (apenas para produtos físicos).
        *   Associação da oferta de **Upsell** (seletor dos demais produtos cadastrados).
*   **Gestão de Pedidos:**
    *   Listagem detalhada de todos os pedidos realizados.
    *   Página de detalhes do pedido (dados do cliente, endereço selecionado se físico, rastreio, status).
*   **Configurações do E-commerce (Identidade e Chaves):**
    *   Formulário de onboarding e credenciais Woovi (Sandbox/Produção).
    *   Configuração de Identidade Visual: Upload do **Logotipo da Loja** e caixa de texto para a **Descrição/Apresentação da Loja**.
    *   Configuração do frete padrão da loja.

---

## 4. Endereços de Clientes Recorrentes (Autopreenchimento)

1.  **Captura no Checkout:** 
    *   Ao preencher o endereço no checkout pela primeira vez (em pedidos contendo produtos físicos), o cliente tem a opção de marcar um checkbox: *"Salvar endereço para compras futuras"*.
    *   Ao finalizar o pedido, o sistema vincula o número de telefone ao contato correspondente no CRM (ou cria um novo) e salva os dados na tabela `shipping_addresses`.
2.  **Autopreenchimento:**
    *   Em compras futuras contendo produto físico, assim que o cliente digita o seu número de WhatsApp no formulário do checkout, a página faz uma busca segura via API (`GET /api/ecommerce/addresses?phone=...`).
    *   Se encontrar endereços salvos, exibe um menu de seleção: *"Encontramos endereços salvos para seu número. Deseja usar um deles?"* com opções como *"Casa (Rua X, 123)"* ou *"Cadastrar outro endereço"*.
    *   Selecionar um endereço preenche instantaneamente todos os campos, reduzindo a fricção e acelerando o checkout Pix.

---

## 5. Estrutura de Frete, Tipo de Produto e Upsell

### Configuração de Frete (Cálculo no Checkout)
1.  **Cálculo no Checkout:** 
    *   Se o carrinho contiver múltiplos itens físicos com fretes diferentes, o sistema adotará a regra de **frete mais alto** entre os itens físicos do carrinho (por exemplo: se o produto A físico tem frete de R$ 10,00 e o produto B físico tem frete de R$ 15,00, o frete total cobrado será R$ 15,00).
    *   **Produtos Digitais são ignorados no cálculo de frete.** Se o carrinho contiver apenas produtos digitais (ebooks, serviços, mentorias), o frete cobrado será automaticamente **R$ 0,00** e o formulário de endereço de entrega será ocultado.

### Fluxo de Upsell no Carrinho/Checkout
1.  **Configuração:** No cadastro do produto, o tenant seleciona um produto recomendado no campo **"Oferta de Upsell"** (referência `upsell_product_id`).
2.  **Exibição:** 
    *   No Cart Drawer (Carrinho) ou na tela de Checkout, se algum produto adicionado ao carrinho contiver um link de upsell ativo, o sistema exibe um card destacado: *"Aproveite também: Adicione [Nome do Produto Upsell] por apenas R$ [Preço da Variação Padrão]!"*
    *   O card de upsell só aparece se o produto sugerido ainda não estiver presente no carrinho.
    *   Clicar em "Adicionar Oferta" insere a variação padrão do produto upsell diretamente no carrinho com a propriedade `is_upsell = true` marcada para fins de analytics.

---

## 6. Estrutura da Storefront Pública (`/shop/[tenant-slug]`)

A storefront é projetada para ser rápida, responsiva e otimizada para SEO móvel.

*   **Página Inicial (`/shop/[tenant-slug]`):**
    *   **Cabeçalho Personalizado:** Exibe o Logotipo carregado pelo tenant e a sua Descrição da Loja como subtítulo do cabeçalho.
    *   Seletor de categorias em abas deslizantes.
    *   Grid de produtos com busca em tempo real.
*   **Página de Produto (`/shop/[tenant-slug]/product/[product-slug]`):**
    *   Galeria de imagens do produto.
    *   Seletores para atributos dinâmicos (tamanho, cor, etc.).
    *   Atualização reativa do preço de acordo com a variação selecionada.
    *   Controles de quantidade e botão de compra direta ou carrinho.
*   **Carrinho (Drawer):**
    *   Persistido via LocalStorage.
    *   Lista itens selecionados, quantidades, permite exclusão, exibe a oferta de **Upsell** aplicável e o subtotal.
*   **Checkout & Pagamento (`/shop/[tenant-slug]/checkout`):**
    *   Coleta Nome, WhatsApp (essencial para buscar endereços salvos e para criar o contato no CRM) e E-mail.
    *   **Filtro Inteligente de Campos:** Se o carrinho contiver apenas itens digitais (serviços/ebooks), oculta a seção de endereço de entrega. Caso contrário, exibe o endereço com opção de autopreenchimento de endereços caso existam registros associados ao WhatsApp.
    *   Exibe o valor do frete calculado e o total.
    *   Chama o endpoint interno do Abbla `POST /api/ecommerce/checkout` que se conecta à API da Woovi usando as chaves criptografadas do tenant, gera a cobrança Pix e exibe a tela de pagamento final.
    *   Exibe QR Code Pix, botão Pix Copia e Cola e contador regressivo. Usa Supabase Realtime para detectar a aprovação imediata do Pix e redirecionar o cliente para a página de sucesso.

---

## 7. Ferramentas de Chat (Inbox & IA)

### Interface do Operador (Inbox Sidebar / Composer)
No painel de inbox (`/inbox`), o operador humano terá um novo botão no Composer representado por uma sacola de compras. O painel associado permite:
1.  Pesquisar produtos ativos no catálogo do tenant.
2.  Visualizar preços e estoques de cada variação.
3.  Executar duas ações:
    *   **Enviar Link:** Copia ou insere automaticamente o link do produto no campo de escrita.
    *   **Gerar Cobrança Direta:** Abre uma janela modal rápida para escolher a quantidade e variação, calcula o frete aplicável, cria o pedido e envia um card estruturado com a imagem do QR Code Pix e o botão "Copiar Chave Pix" direto no chat da conversa.

### Integração de IA (Gemini MCP Tools)
O agente de IA terá acesso a duas novas ferramentas na sua biblioteca de funções:
1.  `search_store_products(query: string)`:
    *   *Descrição:* Busca produtos no catálogo do tenant para responder perguntas de clientes sobre estoque ou opções.
    *   *Retorno:* Detalhes estruturados do produto (nome, variações disponíveis, tipo do produto - físico ou digital, link da página do produto).
2.  `create_direct_charge(variation_id: string, quantity: number)`:
    *   *Descrição:* Cria uma cobrança imediata Pix quando o cliente confirma a intenção de compra de uma variação específica no chat. O frete padrão da loja é somado automaticamente se aplicável (somente para produtos físicos).
    *   *Retorno:* Código Copia e Cola Pix e URL do QR Code gerados pela Woovi, que a IA renderiza no chat.

---

## 8. Automações de Pagamento e Lembretes de Recompra

### Fluxo de Confirmação de Pagamento (Webhook)
Ao receber o webhook de pagamento aprovado da Woovi (`/api/webhooks/woovi`):
1.  **Atualização do Pedido:** O status do pedido em `orders` é modificado para `'paid'`.
2.  **Redução de Estoque:** O estoque da variação em `product_variations` é reduzido conforme a quantidade comprada (apenas para itens físicos).
3.  **Vinculação ao CRM:** 
    *   O número de WhatsApp do cliente é usado para buscar ou criar um contato (`contacts`).
    *   O pedido é vinculado a este contato.
    *   Caso haja uma pipeline de negócios ativa, cria ou move o negócio para a etapa "Ganho/Pago".
4.  **Confirmação e Entrega via Chat:** 
    *   O WhatsApp Business ou integração web do tenant dispara uma mensagem automática para o cliente: *"Seu pagamento do pedido #[ID_CURTO] no valor de R$ [VALOR] foi confirmado! 🎉"*
    *   **Entrega Digital Automática:** Se o pedido contém produtos digitais, o sistema busca os seus respectivos conteúdos em `digital_content` e inclui na mesma mensagem: *"Aqui está o acesso para o seu produto/serviço comprado:\n\n[Instruções/Link de Acesso]"*
5.  **Programação da Recompra:** Se os produtos do pedido possuírem `repurchase_reminder_days` preenchidos, o sistema calcula `repurchase_reminder_at` somando esses dias à data atual.

### Fluxo de Envio do Lembrete de Recompra
O worker diário do Abbla buscará pedidos com `repurchase_reminder_at <= NOW()` e `repurchase_reminder_sent = false`:
1.  Identifica o contato (`contact_id`) e o produto comprado.
2.  Prepara a mensagem personalizada de recompra.
3.  Dispara a mensagem automática no chat:
    > *"Olá, [Nome]! Faz [X] dias que você comprou seu [Nome do Produto]. Está chegando a hora de repor? 😉 Clique aqui para pedir novamente em um clique: [Link da Loja com o Produto no Carrinho]"*
4.  Atualiza `repurchase_reminder_sent = true`.
