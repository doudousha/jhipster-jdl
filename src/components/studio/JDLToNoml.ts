import { parse } from "jhipster-core/lib/dsl/api";

function validJDL(line) {
  var ok = line[0] !== "#";
  return ok ? line.replace(/\/\/[^\n\r]*/gm, "") : "";
}
function isDirective(line) {
  return line.text[0] === "#";
}

enum NomlEntityTypes {
  package,
  entity,
  enum,
  relation,
  field,
}
export type NomlEntity = {
  name: string;
  type: NomlEntityTypes;
  renderType: string;
  description?: string;
  children?: NomlEntity[];
};

export function jdlToNoml(jdlString: string): string {
  const lines = jdlString
    .split("\n")
    .map((s, i) => ({ text: s.trim(), index: i }));
  const pureDirectives = lines
    .filter(isDirective)
    .map((it) => it.text)
    .join("\n")
    .trim();

  // 所有jdl内容
  const pureDiagramCode = lines
    .map((it) => it.text)
    .map(validJDL)
    .join("\n")
    .trim();

  const JDL = parse(pureDiagramCode);
  // JDL.entities[7].name = "测试" // 

  console.log('jdl',JDL)
  let nomlEntities: NomlEntity[] = [];
  const allEntityNames = JDL.entities.map((it) => it.name);
  let unProcessedEntities: string[] = [...allEntityNames];
  if (JDL.applications.length > 0) {
    // draw entities within apps
    nomlEntities = JDL.applications.map((app) => {
      const appLabel = `${app.config.baseName} (${app.config.applicationType})`;
      const [children, unProcessed] = processEntities(
        JDL,
        unProcessedEntities,
        findActualEntities(
          app.entities.entityList,
          app.entities.excluded,
          JDL.options.microservice,
          app.config.baseName,
          allEntityNames
        )
      );
      unProcessedEntities = unProcessed;
      return {
        name: appLabel,
        type: NomlEntityTypes.package,
        renderType: "<package>",
        description: `${
          app.config.clientFramework
            ? `Client: ${app.config.clientFramework}, `
            : ""
        }Auth: ${app.config.authenticationType}, DB: ${
          app.config.prodDatabaseType
        }`,
        children,
      };
    });
  }
  if (unProcessedEntities.length > 0) {
    const [processed] = processEntities(
      JDL,
      unProcessedEntities,
      unProcessedEntities
    );
    // parse remaining entities
    nomlEntities = [...nomlEntities, ...processed];
  }
  // convert to noml format
  const nomlText = nomlEntities.map(mapToNoml);
  return `${pureDirectives}\n${nomlText.join("\n")}\n`;
}
let zhMap = {} // 表名对应中文

function processEntities(
  JDL,
  unProcessed,
  filter: string[] = []
): [NomlEntity[], string[]] {
  zhMap = {} // 清理
  const out: NomlEntity[] = [];
  const allEnumNames = JDL.enums.map((it) => it.name);
  const enumsInApp: string[] = [];
  JDL.entities.forEach((entity) => {
    console.log('entity',entity)
    if (filter.length > 0 && !filter.includes(entity.name)) {
      return;
    }
    // TODO: wqing 修改
        // 去空格
    
    if(entity.javadoc  && entity.javadoc.trim().length > 0){
      entity.javadoc = entity.javadoc.trim()
      if(entity.javadoc.length > 0){
            entity.javadoc = entity.javadoc.replace(/\*/g,'')
            entity.znName =  entity.javadoc+`-${entity.name}`
            zhMap[  entity.name ] = entity.znName 
          }else{
            entity.znName = null
            zhMap[ entity.name] = null
      }
    }
    console.log('NomlEntityTypes.entity',NomlEntityTypes.entity)

    out.push({
      name:  entity.znName ? entity.znName: entity.name,
      // name:  entity.name ,
      type: NomlEntityTypes.entity,
      renderType: "",
      children: entity.body.map((field) => {
       
        // TODO: wqing 修改
        // 去空格
        if(field.javadoc  && field.javadoc.trim().length > 0){
          field.javadoc = field.javadoc.trim()
          if(field.javadoc.length > 0){
     
            field.javadoc = field.javadoc.replace(/\*/g,'')
            field.znName =  field.javadoc+`<${field.name}>`
          }else{
            field.znName = null
            field.canShowZn = false
          }
        }
        // 处理枚举
        if (allEnumNames.includes(field.type)) {
          enumsInApp.push(field.type);
          out.push({
            name: `[${ entity.znName ? entity.znName: entity.name }] --> [${field.type}]`,
            type: NomlEntityTypes.relation,
            renderType: "",
          });
        }
        return {
          name: `${ field.znName ? field.znName : field.name} : ${field.type}${
            field.validations.filter((it) => it.key === "required").length === 1
              ? "*"
              : ""
          }`,
          type: NomlEntityTypes.field,
          renderType: "",
        };
      }),
    });
    unProcessed = unProcessed.filter((it) => it !== entity.name);
  });
  JDL.enums.forEach((en) => {
    if (!enumsInApp.includes(en.name)) {
      return;
    }
    out.push({
      name: `${en.name}`,
      type: NomlEntityTypes.enum,
      renderType: "<reference>",
      description: "<<enum>>",
      children: en.values.map((val) => ({
        name: `${val.key}`,
        type: NomlEntityTypes.field,
        renderType: "",
      })),
    });
  });
  JDL.relationships.forEach((rel) => {
    console.log('rel',rel)
    if (
      filter.length > 0 &&
      (![...filter, "User"].includes(rel.from.name) ||
        ![...filter, "User"].includes(rel.to.name))
    ) {
      return;
    }
    // let fromNameGroup = rel.from.javadoc.match(new RegExp("\s*"+rel.from.name+":([^\x00-\x80]+|[a-zA-Z0-9]*)"))
    // let toNameGroup = rel.from.javadoc.match(new RegExp("\s*"+rel.from.name+":([^\x00-\x80]+|[a-zA-Z0-9]*)"))
    // console.log('fromNameGroup[1]- ',fromNameGroup[1])
    // console.log('toNameGroup[1]- ',toNameGroup[1])

    // let map = {Department:'部门',Employee:'员工',JobHistory:'工作历史',Job:'工作'}
    console.log('zhMap',zhMap)
    out.push({
      name: `[${ zhMap[ rel.from.name]}] ${getCardinality(rel.cardinality)} [${
        zhMap[ rel.to.name]
      }]`,
      type: NomlEntityTypes.relation,
      renderType: "",
    });
  });

  return [out, unProcessed];
}

type MsOption = { list: string[] };

function findActualEntities(
  included: string[],
  excluded: string[],
  msOptions: { [key: string]: MsOption },
  appName: string,
  entities: string[]
): string[] {
  let include = included;
  if (include.includes("*")) {
    include = [...include, ...entities];
    if (msOptions) {
      Object.entries(msOptions).forEach(([key, val]) => {
        if (key !== appName) {
          include = include.filter((it) => !val.list.includes(it));
        }
      });
    }
  }
  if (excluded.length !== 0) {
    include = include.filter((it) => !excluded.includes(it));
  }
  return include;
}

function mapToNoml(it: NomlEntity) {
  switch (it.type) {
    case NomlEntityTypes.field:
    case NomlEntityTypes.relation:
      return `${it.name}\n`;
    default:
      return `[${it.renderType}${it.name}|${
        it.description ? `${it.description}|` : ""
      }\n${it.children?.map(mapToNoml).join("\n")}\n]`;
  }
}

function getCardinality(cardinality) {
  switch (cardinality) {
    case "one-to-many":
    case "OneToMany":
      return "o- (1..*)";
    case "OneToOne":
    case "one-to-one":
      return "- (1..1)";
    case "ManyToOne":
    case "many-to-one":
      return "(1..*) -o";
    case "ManyToMany":
    case "many-to-many":
      return "(*..*) o-o";
    default:
      return "(1..*) ->";
  }
}
