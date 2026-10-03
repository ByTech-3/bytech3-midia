# bytech3-midia

Biblioteca pública dos criativos da **ByTech3**: carrosséis e Reels do Instagram @bytech3_, criativos de anúncio (estáticos e motion) e arquivos de marca.

**Para que serve:** controle (tudo num lugar só, por data e tipo) e **link público** para o Metricool agendar os posts. O link de cada arquivo é:

```
https://raw.githubusercontent.com/ByTech-3/bytech3-midia/main/<caminho-do-arquivo>
```

> O que está aqui é público. Só entra mídia final (imagens e vídeos). Roteiros, legendas, código e dados ficam no repositório privado `amuncios-venda`.

## Estrutura

```
instagram/
  AAAA-MM/
    carrosseis/<data>-<hora>-<tema>/   card-01.jpg … card-NN.jpg + folha.png (prévia de todos os cards)
    reels/<data>-<hora>-<tema>/        reel.mp4 + capa.jpg
  destaques/                           capas dos destaques do perfil
anuncios/
  <campanha>/
    estaticos/<criativo>/              cards e imagens de anúncio
    motion/<criativo>/                 vídeos 9x16 / 4x5 + capas
marca/
  bytech3/                             logo e fotos de perfil
  maxtec/                              logo da plataforma Maxtec
INDICE.md                              lista de tudo, com status (aguardando ok, aprovado, agendado, publicado)
```

## Como é atualizado

Cada peça nasce no repositório `amuncios-venda`. Depois de pronta, `python3 tools/social/sincronizar_midia.py` copia a mídia para cá, refaz o `INDICE.md` e o commit é feito nos dois repositórios.
