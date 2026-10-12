function runTest() {
  const sections = Array.from({ length: 100 }, (_, i) => ({
    roles: Array.from({ length: 20 }, (_, j) => ({ id: `role-${j}` }))
  }));

  const activeRole = "role-5";

  let start = performance.now();
  let count = 0;
  for (let i = 0; i < 1000; i++) {
    for (const section of sections) {
      const filtered = section.roles.filter(role => !activeRole || role.id === activeRole);
      const mapped = filtered.map(role => role.id);
      count += mapped.length;
    }
  }
  console.log('Filter + Map:', performance.now() - start);

  start = performance.now();
  let count2 = 0;
  for (let i = 0; i < 1000; i++) {
    for (const section of sections) {
      const mapped = section.roles.reduce((acc, role) => {
        if (!activeRole || role.id === activeRole) {
           acc.push(role.id);
        }
        return acc;
      }, []);
      count2 += mapped.length;
    }
  }
  console.log('Reduce:', performance.now() - start);

  start = performance.now();
  let count3 = 0;
  for (let i = 0; i < 1000; i++) {
    for (const section of sections) {
      const mapped = [];
      for (const role of section.roles) {
        if (!activeRole || role.id === activeRole) {
           mapped.push(role.id);
        }
      }
      count3 += mapped.length;
    }
  }
  console.log('Loop:', performance.now() - start);
}

runTest();
