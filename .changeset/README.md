# Changesets

Add a changeset for anything user-visible:

```bash
pnpm changeset
```

All packages are **fixed-versioned** together, so `@vestra/core@1.2.0` always pairs with
`@vestra/rest@1.2.0`. A user can never assemble a combination that was never tested
together, and version numbers stay a meaningful thing to report in a bug.
