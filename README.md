# Eleições2026

Painel da apuração das eleições de 2026 em colunas lado a lado, no estilo TweetDeck.
Cada coluna é o Brasil, um estado ou um município, com placar, tendências, evolução e marcos da apuração.

No ar em **[eleicoes2026-ashy.vercel.app](https://eleicoes2026-ashy.vercel.app)**.

![Painel com as colunas Brasil, estado de São Paulo e cidade de São Paulo](docs/screenshots/painel-escuro.png)

<table>
  <tr>
    <td><img src="docs/screenshots/painel-claro.png" alt="Painel no modo claro"></td>
    <td><img src="docs/screenshots/adicionar-coluna.png" alt="Busca de estados e municípios para adicionar uma coluna"></td>
  </tr>
  <tr>
    <td align="center">Modo claro</td>
    <td align="center">Qualquer estado ou município vira uma coluna</td>
  </tr>
</table>

## Como os dados chegam

Os navegadores nunca consultam o TSE diretamente.
Um único poller (`supabase/functions/poll-tse`) roda a cada 5 segundos e faz requisições condicionais ao CDN de resultados do TSE.
Ele usa os índices de abrangência (`-ab.json`) para descobrir o que mudou e só baixa os resultados das disputas que alguém está acompanhando.
Os resultados ficam no Postgres (`results_latest` e `results_history`) e cada mudança é enviada aos navegadores via Supabase Realtime.
A função `watch` entrega o estado atual e o histórico quando uma coluna é aberta.

## Desenvolvimento

```sh
bun install
bun run dev
```

Outros comandos:

- `bun run test` roda os testes, que usam arquivos reais do TSE em `src/lib/election/__fixtures__/`.
- `bun run lint` roda o ESLint e o Prettier.
- `bun scripts/gen-places.ts` regenera a lista de lugares a partir da configuração do TSE.
