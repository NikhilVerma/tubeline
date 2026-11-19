# tubeline agent skill

An installable agent skill for drawing graphs as tube maps with
[tubeline](https://nikhil-verma.com/tubeline/).

## Install

```bash
npx skills add NikhilVerma/tubeline          # project-level
npx skills add NikhilVerma/tubeline -g       # available in every project
```

## What it does

The skill tells an agent:

- when a tube map suits a graph, and when another library is the better choice;
- the exact JSON for stations, lines and connections, and the rules it must follow;
- the API for drawing a map and planning a journey; and
- the mistakes people make most often, such as a container with no height.

## Layout

```
skills/tubeline/
├── SKILL.md              # everything an agent needs
└── agents/openai.yaml    # display metadata for OpenAI-style agent hosts
```

## License

MIT, the same as the library.
