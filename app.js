const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();
const convertDistrictDBObjectToResponseObject = (data) => {
  return {
    districtName: data.district_name,
    districtId: data.district_id,
    stateId: data.state_id,
    cases: data.cases,
    cured: data.cured,
    active: data.active,
    deaths: data.deaths,
  };
};
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//API 1

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
//API 2
//1.GET states details
app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT
      *
    FROM
      state;`;
  const statesArray = await db.all(getStatesQuery);
  response.send(
    statesArray.map((eachState) => ({
      stateId: eachState.state_id,
      stateName: eachState.state_name,
      population: eachState.population,
    }))
  );
});
//API 3
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT 
      * 
    FROM 
      state
    WHERE 
      state_id = ${stateId};`;
  const state = await db.get(getStateQuery);

  response.send({
    stateId: state.state_id,
    stateName: state.state_name,
    population: state.population,
  });
});
// API 4.Add a district

app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const postDistrictQuery = `
  INSERT INTO
    district (district_name, state_id,cases,cured,active,deaths)
  VALUES
    ('${districtName}', '${stateId}', '${cases}','${cured}','${active}','${deaths}');`;
  const district = await db.run(postDistrictQuery);

  response.send("District Successfully Added");
});

// district
//API 5.GET District DETAILS
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
    SELECT 
      * 
    FROM 
      district
    WHERE 
      district_id = ${districtId};`;
    const district = await db.get(getDistrictQuery);
    response.send(convertDistrictDBObjectToResponseObject(district));
  }
);
//API 6.Delete a District
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
  DELETE FROM
    district
  WHERE
    district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);
//API 7.Update A District
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const { districtId } = request.params;

    const updateDistrictQuery = `
  UPDATE
  district
  SET
 
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = '${cases}',
    cured = '${cured}',
    active = '${active}',
    deaths = '${deaths}'
  WHERE
    district_id = ${districtId};`;

    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);
//API 9.RETURN STATE NAME
app.get(
  "/districts/:districtId/details/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;

    const getStateName = `
  SELECT 
  state_name FROM 
  state INNER JOIN district
   ON state.state_id = district.state_id 
   WHERE district.district_id=${districtId};
  `;
    const stateName = await db.get(getStateName);
    response.send({ stateName: stateName.state_name });
  }
);
//API 8 GET STATISTICS
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const statistics = `
  SELECT 
  sum(cases)as total_cases,sum(cured)as total_cured,sum(active)as total_active,sum(deaths)as total_deaths
   FROM 
   state INNER JOIN district ON state.state_id = district.state_id 
  WHERE state.state_id=${stateId};
  `;
    const calculations = await db.get(statistics);
    response.send({
      totalCases: calculations.total_cases,
      totalCured: calculations.total_cured,
      totalActive: calculations.total_active,
      totalDeaths: calculations.total_deaths,
    });
  }
);

module.exports = app;
